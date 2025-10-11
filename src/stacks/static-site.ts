import { App } from 'cdktf';
import {
  StaticContentStack,
  QueueStack,
  WorkerStack,
  StaticSiteZoneStack,
  WorkersDnsStack,
  MonitoringStack,
  WranglerConfigStack,
  TurnstileStack,
  ensureAwsAuth,
} from '@minr-dev/cdktf-toolkit';
import { buildProjectConfig } from '../config';
import { configureRemoteState } from '../shared/backend-helper';

/**
 * 静的サイト配信用インフラのメイン実行フロー
 *
 * 静的サイト（HTML/CSS/JS）の配信とAPIエンドポイント（Cloudflare Workers）を構築:
 * 1. StaticContentStack: S3バケット、CloudFront、デプロイユーザー
 * 2. QueueStack: SQSキュー（コメント、問い合わせ）
 * 3. StaticSiteZoneStack: Cloudflare DNS設定（静的サイト用）
 * 4. WorkersDnsStack: Cloudflare DNS設定（Workers API用）
 * 5. TurnstileStack: Cloudflare Turnstile（スパム対策）
 * 6. WorkerStack: Cloudflare Workers（コメント投稿、問い合わせフォーム）
 * 7. WranglerConfigStack: Wrangler設定ファイル生成
 * 8. MonitoringStack: CloudWatch Logs
 */
export function stackStaticSite(app: App): void {
  const projectConfig = buildProjectConfig();
  const { environment } = projectConfig;
  console.log(`[Static Site] Environment: ${environment}`);

  // AWS認証確認
  ensureAwsAuth();

  // S3Backend設定
  const backendConfig = {
    stateBucket: 'galileo-rent-terraform-state',
    stateDynamodbTable: 'galileo-rent-terraform-lock',
    stateRegion: projectConfig.awsRegion,
    stateKeyPrefix: 'galileo-rent',
    environment,
  };

  const staticSiteFqdn = `${projectConfig.staticSiteSubDomain}.${projectConfig.staticSiteBaseDomain}`;
  const staticApiFqdn = `${projectConfig.staticApiSubDomain}.${projectConfig.staticSiteBaseDomain}`;

  // 1. 静的サイト配信スタック（StaticContentStack）
  const staticContentStack = StaticContentStack.createDefault(app, 'static-content-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    bucketName: projectConfig.staticSiteBucketName,
    oacName: projectConfig.staticSiteOacName,
    deployUserName: projectConfig.staticSiteDeployUserName,
    deployPolicyName: projectConfig.staticSiteDeployPolicyName,
    purposeTag: 'static-site',
  });
  configureRemoteState(staticContentStack, {
    ...backendConfig,
    stackId: 'static-content-stack',
  });

  // 2. SQS キュースタック（QueueStack）
  const queueStack = new QueueStack(app, 'queue-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    queues: [
      {
        id: projectConfig.commentsQueueId,
        name: projectConfig.commentsQueueName,
        visibilityTimeoutSeconds: 300,
        messageRetentionSeconds: 1209600, // 14日
      },
      {
        id: projectConfig.inquiryQueueId,
        name: projectConfig.inquiryQueueName,
        visibilityTimeoutSeconds: 300,
        messageRetentionSeconds: 1209600, // 14日
      },
    ],
    policies: [
      {
        id: projectConfig.workerSqsPolicyId,
        name: projectConfig.workerSqsPolicyName,
        description: 'Allow Cloudflare Workers to send messages to SQS queues',
        statements: [
          {
            actions: ['sqs:SendMessage'],
            resources: [{ queueId: projectConfig.commentsQueueId }, { queueId: projectConfig.inquiryQueueId }],
          },
        ],
      },
    ],
    users: [
      {
        id: projectConfig.workerSqsUserId,
        name: projectConfig.workerSqsUserName,
        policyId: projectConfig.workerSqsPolicyId,
        tags: {
          Purpose: 'worker-sqs-access',
        },
      },
    ],
  });
  configureRemoteState(queueStack, {
    ...backendConfig,
    stackId: 'queue-stack',
  });

  // 3. 静的サイト用 Cloudflare Zone スタック（StaticSiteZoneStack）
  const staticSiteZoneStack = new StaticSiteZoneStack(app, 'static-site-zone-stack', {
    environment,
    domainName: projectConfig.staticSiteBaseDomain,
    subDomainName: projectConfig.staticSiteSubDomain,
    cloudfrontDomainName: staticContentStack.cloudfrontDomainName,
    acmValidationRecord: staticContentStack.acmValidationRecord,
  });
  configureRemoteState(staticSiteZoneStack, {
    ...backendConfig,
    stackId: 'static-site-zone-stack',
  });
  staticSiteZoneStack.addDependency(staticContentStack);

  // 4. Workers 用 DNS スタック（WorkersDnsStack）
  const workersDnsStack = new WorkersDnsStack(app, 'workers-dns-stack', {
    environment,
    zoneId: staticSiteZoneStack.zoneId,
    zoneName: projectConfig.staticSiteBaseDomain,
    apiSubDomainName: projectConfig.staticApiSubDomain,
  });
  configureRemoteState(workersDnsStack, {
    ...backendConfig,
    stackId: 'workers-dns-stack',
  });
  workersDnsStack.addDependency(staticSiteZoneStack);

  // 5. Cloudflare Turnstile スタック
  const turnstileDomains = new Set<string>([projectConfig.staticSiteBaseDomain, staticSiteFqdn, staticApiFqdn]);

  const turnstileStack = new TurnstileStack(app, 'turnstile-stack', {
    environment,
    widgets: [
      {
        id: projectConfig.turnstileId,
        name: projectConfig.turnstileName,
        domains: Array.from(turnstileDomains),
      },
    ],
  });
  configureRemoteState(turnstileStack, {
    ...backendConfig,
    stackId: 'turnstile-stack',
  });

  const turnstileWidget = turnstileStack.widgets.get(projectConfig.turnstileId);
  if (!turnstileWidget) {
    throw new Error(`Turnstile widget "${projectConfig.turnstileId}" is not configured.`);
  }

  // 6. Cloudflare Workers スタック - コメント投稿
  const workerSqsUser = queueStack.users.get(projectConfig.workerSqsUserId);
  if (!workerSqsUser) {
    throw new Error(`${projectConfig.workerSqsUserId} not found in queueStack`);
  }

  const commentsQueue = queueStack.queues.get(projectConfig.commentsQueueId);
  if (!commentsQueue) {
    throw new Error(`${projectConfig.commentsQueueId} not found in queueStack`);
  }

  const commentsWorkerStack = new WorkerStack(app, 'comments-worker-stack', {
    environment,
    domainName: projectConfig.staticSiteBaseDomain,
    workerName: `comments-worker-${environment}`,
    scriptSourcePath: 'src/workers/comments-worker.ts',
    routes: [`https://${staticApiFqdn}/comments/*`],
    secrets: {
      AWS_ACCESS_KEY_ID: workerSqsUser.accessKeyId,
      AWS_SECRET_ACCESS_KEY: workerSqsUser.secretAccessKey,
      AWS_REGION: projectConfig.awsRegion,
      SQS_QUEUE_URL: commentsQueue.queue.url,
      TURNSTILE_SECRET_KEY: turnstileWidget.secret,
    },
  });
  configureRemoteState(commentsWorkerStack, {
    ...backendConfig,
    stackId: 'comments-worker-stack',
  });
  commentsWorkerStack.addDependency(queueStack);

  // 7. Cloudflare Workers スタック - 問い合わせフォーム
  const inquiryQueue = queueStack.queues.get(projectConfig.inquiryQueueId);
  if (!inquiryQueue) {
    throw new Error(`${projectConfig.inquiryQueueId} not found in queueStack`);
  }

  const inquiryWorkerStack = new WorkerStack(app, 'inquiry-worker-stack', {
    environment,
    domainName: projectConfig.staticSiteBaseDomain,
    workerName: `inquiry-worker-${environment}`,
    scriptSourcePath: 'src/workers/inquiry-worker.ts',
    routes: [`https://${staticApiFqdn}/inquiry/*`],
    secrets: {
      AWS_ACCESS_KEY_ID: workerSqsUser.accessKeyId,
      AWS_SECRET_ACCESS_KEY: workerSqsUser.secretAccessKey,
      AWS_REGION: projectConfig.awsRegion,
      SQS_QUEUE_URL: inquiryQueue.queue.url,
      TURNSTILE_SECRET_KEY: turnstileWidget.secret,
    },
  });
  configureRemoteState(inquiryWorkerStack, {
    ...backendConfig,
    stackId: 'inquiry-worker-stack',
  });
  inquiryWorkerStack.addDependency(queueStack);

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

  // 9. MonitoringStack（ログ監視）
  const monitoringStack = new MonitoringStack(app, 'monitoring-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    logGroups: [
      {
        id: 'cloudflare_workers_log',
        logGroupName: `/cloudflare/workers/${environment}`,
        retentionDays: 30,
      },
    ],
  });
  configureRemoteState(monitoringStack, {
    ...backendConfig,
    stackId: 'monitoring-stack',
  });
}
