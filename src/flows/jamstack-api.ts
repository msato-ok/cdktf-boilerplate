import { App, TerraformStack } from 'cdktf';
import {
  QueueStack,
  QueueAccessStack,
  WorkerStack,
  WorkersDnsStack,
  WranglerConfigStack,
  TurnstileStack,
  ensureAwsAuth,
  SqsLogForwarderStack,
  MonitoringStack,
} from '@minr-dev/cdktf-toolkit';
import { buildProjectConfig, buildBackendConfig } from '../config';
import { configureRemoteState } from '../shared/backend-helper';

/**
 * Jamstack API インフラのデプロイフロー
 *
 * Cloudflare Workers を使用した API エンドポイントと SQS 連携、ログ監視を構築:
 * 1. QueueStack: SQSキュー（コメント、問い合わせ）
 * 2. WorkersDnsStack: Cloudflare DNS設定（Workers API用）
 * 3. TurnstileStack: Cloudflare Turnstile（スパム対策）
 * 4. WorkerStack: Cloudflare Workers（コメント投稿、問い合わせフォーム）
 * 5. WranglerConfigStack: Wrangler設定ファイル生成
 *
 * 前提条件: 静的サイトのZone（StaticSiteZoneStack）が既にデプロイ済みであること
 */
export function deployJamstackApi(app: App, zoneId: string, dependencyStack?: TerraformStack): void {
  const projectConfig = buildProjectConfig();
  const { environment, jamstackApi } = projectConfig;
  console.log(`[Jamstack API] Environment: ${environment}`);

  // AWS認証確認
  ensureAwsAuth();

  // S3Backend設定
  const backendConfig = buildBackendConfig(environment, projectConfig.awsRegion);

  const staticApiFqdn = `${jamstackApi.apiSubDomain}.${jamstackApi.baseDomain}`;

  // 1. SQS キュースタック（QueueStack）
  const commentsQueueStack = new QueueStack(app, 'comments-queue-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    name: jamstackApi.commentsQueueName,
    visibilityTimeoutSeconds: 300,
    messageRetentionSeconds: 1209600, // 14日
  });
  configureRemoteState(commentsQueueStack, {
    ...backendConfig,
    stackId: 'comments-queue-stack',
  });
  if (dependencyStack) {
    commentsQueueStack.addDependency(dependencyStack);
  }

  const inquiryQueueStack = new QueueStack(app, 'inquiry-queue-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    name: jamstackApi.inquiryQueueName,
    visibilityTimeoutSeconds: 300,
    messageRetentionSeconds: 1209600, // 14日
  });
  configureRemoteState(inquiryQueueStack, {
    ...backendConfig,
    stackId: 'inquiry-queue-stack',
  });
  if (dependencyStack) {
    inquiryQueueStack.addDependency(dependencyStack);
  }

  const notificationQueueStack = new QueueStack(app, 'notification-queue-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    name: jamstackApi.notificationQueueName,
    visibilityTimeoutSeconds: 60,
    messageRetentionSeconds: 86400, // 1日
    deadLetter: {
      messageRetentionSeconds: 1209600, // DLQ は 14日保持で既存設定と整合
    },
  });
  configureRemoteState(notificationQueueStack, {
    ...backendConfig,
    stackId: 'notification-queue-stack',
  });
  if (dependencyStack) {
    notificationQueueStack.addDependency(dependencyStack);
  }

  const workerQueueAccessStack = new QueueAccessStack(app, 'worker-queue-access-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    policyName: jamstackApi.workerSqsPolicyName,
    description: 'Allow Cloudflare Workers to send messages to SQS queues',
    queueArns: [
      commentsQueueStack.queue.queue.arn,
      inquiryQueueStack.queue.queue.arn,
      notificationQueueStack.queue.queue.arn,
    ],
    userName: jamstackApi.workerSqsUserName,
    tags: {
      Purpose: 'worker-sqs-access',
    },
  });
  configureRemoteState(workerQueueAccessStack, {
    ...backendConfig,
    stackId: 'worker-queue-access-stack',
  });
  workerQueueAccessStack.addDependency(commentsQueueStack);
  workerQueueAccessStack.addDependency(inquiryQueueStack);
  workerQueueAccessStack.addDependency(notificationQueueStack);
  if (dependencyStack) {
    workerQueueAccessStack.addDependency(dependencyStack);
  }

  // 2. Workers 用 DNS スタック（WorkersDnsStack）
  const workersDnsStack = new WorkersDnsStack(app, 'workers-dns-stack', {
    environment,
    zoneId,
    zoneName: jamstackApi.baseDomain,
    apiSubDomainName: jamstackApi.apiSubDomain,
  });
  configureRemoteState(workersDnsStack, {
    ...backendConfig,
    stackId: 'workers-dns-stack',
  });

  // 3. Cloudflare Turnstile スタック
  const staticSiteFqdn = `${projectConfig.staticSite.subDomain}.${projectConfig.staticSite.baseDomain}`;
  const turnstileDomains = new Set<string>([jamstackApi.baseDomain, staticSiteFqdn, staticApiFqdn]);

  const turnstileStack = new TurnstileStack(app, 'turnstile-stack', {
    environment,
    widgets: [
      {
        id: jamstackApi.turnstileId,
        name: jamstackApi.turnstileName,
        domains: Array.from(turnstileDomains),
      },
    ],
  });
  configureRemoteState(turnstileStack, {
    ...backendConfig,
    stackId: 'turnstile-stack',
  });

  const turnstileWidget = turnstileStack.widgets.get(jamstackApi.turnstileId);
  if (!turnstileWidget) {
    throw new Error(`Turnstile widget "${jamstackApi.turnstileId}" is not configured.`);
  }
  const turnstileSecret = turnstileWidget.secret;

  // 4. Cloudflare Workers スタック - コメント投稿
  const workerAccessKeyId = workerQueueAccessStack.user.accessKeyId;
  const workerSecretAccessKey = workerQueueAccessStack.user.secretAccessKey;

  const commentsQueueUrl = commentsQueueStack.queue.queue.url;
  const notificationQueueUrl = notificationQueueStack.queue.queue.url;
  const notificationDlq = notificationQueueStack.deadLetterQueue;

  const commentsWorkerStack = new WorkerStack(app, 'comments-worker-stack', {
    environment,
    domainName: jamstackApi.baseDomain,
    workerName: `comments-worker-${environment}`,
    scriptSourcePath: 'src/workers/comments-worker.ts',
    routes: [`https://${staticApiFqdn}/comments`, `https://${staticApiFqdn}/comments/*`],
    secrets: {
      AWS_ACCESS_KEY_ID: workerAccessKeyId,
      AWS_SECRET_ACCESS_KEY: workerSecretAccessKey,
      AWS_REGION: projectConfig.awsRegion,
      SQS_QUEUE_URL: commentsQueueUrl,
      TURNSTILE_SECRET_KEY: turnstileSecret,
      NOTIFICATION_SQS_QUEUE_URL: notificationQueueUrl,
    },
  });
  configureRemoteState(commentsWorkerStack, {
    ...backendConfig,
    stackId: 'comments-worker-stack',
  });
  commentsWorkerStack.addDependency(commentsQueueStack);
  commentsWorkerStack.addDependency(workerQueueAccessStack);

  // 5. Cloudflare Workers スタック - 問い合わせフォーム
  const inquiryQueueUrl = inquiryQueueStack.queue.queue.url;

  const inquiryWorkerStack = new WorkerStack(app, 'inquiry-worker-stack', {
    environment,
    domainName: jamstackApi.baseDomain,
    workerName: `inquiry-worker-${environment}`,
    scriptSourcePath: 'src/workers/inquiry-worker.ts',
    routes: [`https://${staticApiFqdn}/inquiry`, `https://${staticApiFqdn}/inquiry/*`],
    secrets: {
      AWS_ACCESS_KEY_ID: workerAccessKeyId,
      AWS_SECRET_ACCESS_KEY: workerSecretAccessKey,
      AWS_REGION: projectConfig.awsRegion,
      SQS_QUEUE_URL: inquiryQueueUrl,
      TURNSTILE_SECRET_KEY: turnstileSecret,
      NOTIFICATION_SQS_QUEUE_URL: notificationQueueUrl,
    },
  });
  configureRemoteState(inquiryWorkerStack, {
    ...backendConfig,
    stackId: 'inquiry-worker-stack',
  });
  inquiryWorkerStack.addDependency(inquiryQueueStack);
  inquiryWorkerStack.addDependency(workerQueueAccessStack);

  // 6. エラーログフォワーダー
  const workerErrorLogGroupName = `/${projectConfig.appName}/${environment}/worker-error`;

  const workerErrorForwarderStack = new SqsLogForwarderStack(app, 'worker-error-forwarder-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    appName: projectConfig.appName,
    queueArn: notificationQueueStack.queue.queue.arn,
    queueName: notificationQueueStack.queue.queue.name,
    deadLetterQueueArn: notificationDlq?.arn,
    lambdaName: `${projectConfig.appName}-worker-error-forwarder-${environment}`,
    logGroupName: workerErrorLogGroupName,
  });
  configureRemoteState(workerErrorForwarderStack, {
    ...backendConfig,
    stackId: 'worker-error-forwarder-stack',
  });
  workerErrorForwarderStack.addDependency(notificationQueueStack);

  // 7. ログ監視スタック
  const workerErrorMonitoringStack = new MonitoringStack(app, 'worker-error-monitoring-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    logGroup: {
      logGroupName: workerErrorLogGroupName,
      retentionDays: 30,
      tags: { Purpose: 'worker-error-logs' },
    },
    metricFilter: {
      filterName: `${projectConfig.appName}-worker-errors-${environment}`,
      pattern: '{ $.level = "error" }',
      metricName: 'WorkerErrorCount',
      namespace: `${projectConfig.appName}/Workers`,
      value: '1',
      defaultValue: '0',
    },
    snsTopic: {
      name: `${projectConfig.appName}-worker-error-alerts-${environment}`,
      displayName: `${projectConfig.appName} worker error alerts (${environment})`,
      subscriptions: projectConfig.alertEmails.map(endpoint => ({ protocol: 'email', endpoint })),
      tags: { Purpose: 'worker-error-alerts' },
    },
    alarm: {
      alarmName: `${projectConfig.appName}-worker-error-${environment}`,
      metricName: 'WorkerErrorCount',
      namespace: `${projectConfig.appName}/Workers`,
      threshold: 3,
      comparisonOperator: 'GreaterThanOrEqualToThreshold',
      evaluationPeriods: 1,
      period: 300,
      statistic: 'Sum',
      treatMissingData: 'notBreaching',
      alarmDescription: 'Worker error count exceeded threshold',
    },
  });
  configureRemoteState(workerErrorMonitoringStack, {
    ...backendConfig,
    stackId: 'worker-error-monitoring-stack',
  });
  workerErrorMonitoringStack.addDependency(workerErrorForwarderStack);

  // 8. Wrangler設定生成（環境ごとに1つの設定）
  const wranglerConfigStack = new WranglerConfigStack(app, 'wrangler-config-stack', {
    environment,
    workers: [
      {
        id: 'comments',
        baseName: 'comments-worker',
        scriptPath: 'src/workers/comments-worker.ts',
        compatibilityFlags: ['nodejs_compat'],
        environments: {
          [environment]: { name: `comments-worker-${environment}`, routes: [`https://${staticApiFqdn}/comments/*`] },
        },
        secretNames: [
          'AWS_ACCESS_KEY_ID',
          'AWS_SECRET_ACCESS_KEY',
          'AWS_REGION',
          'SQS_QUEUE_URL',
          'TURNSTILE_SECRET_KEY',
        ],
      },
      {
        id: 'inquiry',
        baseName: 'inquiry-worker',
        scriptPath: 'src/workers/inquiry-worker.ts',
        compatibilityFlags: ['nodejs_compat'],
        environments: {
          [environment]: { name: `inquiry-worker-${environment}`, routes: [`https://${staticApiFqdn}/inquiry/*`] },
        },
        secretNames: [
          'AWS_ACCESS_KEY_ID',
          'AWS_SECRET_ACCESS_KEY',
          'AWS_REGION',
          'SQS_QUEUE_URL',
          'TURNSTILE_SECRET_KEY',
        ],
      },
    ],
  });
  configureRemoteState(wranglerConfigStack, {
    ...backendConfig,
    stackId: 'wrangler-config-stack',
  });
}
