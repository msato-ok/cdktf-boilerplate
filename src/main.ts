import { App, S3Backend } from 'cdktf';
import {
  AwsS3MediaStack,
  CloudflareMediaStack,
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
import { buildProjectConfig } from './config';

/**
 * galileo-wp-iac プロジェクト固有のメイン実行フロー
 *
 * WordPress S3 Media Offload用インフラを以下の順序でデプロイ:
 * 1. AWS S3 Media Stack: S3バケット、CloudFront、IAMリソース
 * 2. Cloudflare Media Stack: CDN配信用DNS、TLS設定
 *
 * 環境は実行時のディレクトリまたはコマンドライン引数で指定
 */

function main(): void {
  const projectConfig = buildProjectConfig();
  const { environment } = projectConfig;
  console.log(`Environment: ${environment}`);

  const app = new App();

  // AWS認証確認
  ensureAwsAuth();

  // S3Backend（TerraformのステートをS3に保持）用の設定
  const stateBucket = 'galileo-rent-terraform-state';
  const stateDynamodbTable = 'galileo-rent-terraform-lock';
  const stateRegion = projectConfig.awsRegion;
  const stateKeyPrefix = 'galileo-rent';

  const backendKeyFor = (stackId: string): string => `${stateKeyPrefix}/${environment}/${stackId}.tfstate`;

  const configureRemoteState = (
    stack:
      | AwsS3MediaStack
      | CloudflareMediaStack
      | StaticContentStack
      | QueueStack
      | WorkerStack
      | StaticSiteZoneStack
      | WorkersDnsStack
      | MonitoringStack
      | WranglerConfigStack
      | TurnstileStack,
    stackId: string,
  ): void => {
    new S3Backend(stack, {
      bucket: stateBucket,
      key: backendKeyFor(stackId),
      region: stateRegion,
      dynamodbTable: stateDynamodbTable,
      encrypt: true,
    });
  };

  const cdnFqdn = `${projectConfig.cdnSubDomain}.${projectConfig.cdnBaseDomain}`;

  // 1. AWS S3 Media スタック
  const awsS3MediaStack = new AwsS3MediaStack(app, 'aws-s3-media-stack', {
    environment,
    bucketName: projectConfig.cdnBucketName,
    cdnDomain: cdnFqdn,
    awsRegion: projectConfig.awsRegion,
    oacName: projectConfig.cdnOacName,
    iamPolicyName: projectConfig.iamPolicyName,
    iamUserName: projectConfig.iamUserName,
  });
  configureRemoteState(awsS3MediaStack, 'aws-s3-media-stack');

  // 2. Cloudflare Media スタック（AWS S3 Media Stackの出力値を使用）
  const cloudflareMediaStack = new CloudflareMediaStack(app, 'cloudflare-media-stack', {
    environment,
    domainName: projectConfig.cdnBaseDomain,
    subDomainName: projectConfig.cdnSubDomain,
    cloudfrontDomainName: awsS3MediaStack.cloudfrontDomainName,
    acmValidationRecord: awsS3MediaStack.acmValidationRecord,
  });
  configureRemoteState(cloudflareMediaStack, 'cloudflare-media-stack');

  // スタック間の依存関係を明示的に定義
  cloudflareMediaStack.addDependency(awsS3MediaStack);

  // 3. 静的サイト配信スタック（StaticContentStack）
  const staticSiteFqdn = `${projectConfig.staticSiteSubDomain}.${projectConfig.staticSiteBaseDomain}`;
  const staticApiFqdn = `${projectConfig.staticApiSubDomain}.${projectConfig.staticSiteBaseDomain}`;

  const staticContentStack = new StaticContentStack(app, 'static-content-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    bucketName: projectConfig.staticSiteBucketName,
    oacName: projectConfig.staticSiteOacName,
    deployUserName: projectConfig.staticSiteDeployUserName,
    deployPolicyName: projectConfig.staticSiteDeployPolicyName,
    fqdn: staticSiteFqdn,
    purposeTag: 'static-site',
  });
  configureRemoteState(staticContentStack, 'static-content-stack');

  // 4. SQS キュースタック（QueueStack）
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
  configureRemoteState(queueStack, 'queue-stack');

  // 5. 静的サイト用 Cloudflare Zone スタック（StaticSiteZoneStack）
  const staticSiteZoneStack = new StaticSiteZoneStack(app, 'static-site-zone-stack', {
    environment,
    domainName: projectConfig.staticSiteBaseDomain,
    subDomainName: projectConfig.staticSiteSubDomain,
    cloudfrontDomainName: staticContentStack.cloudfrontDomainName,
    acmValidationRecord: staticContentStack.acmValidationRecord,
  });
  configureRemoteState(staticSiteZoneStack, 'static-site-zone-stack');
  staticSiteZoneStack.addDependency(staticContentStack);

  // 5-2. Workers 用 DNS スタック（WorkersDnsStack）
  const workersDnsStack = new WorkersDnsStack(app, 'workers-dns-stack', {
    environment,
    zoneId: staticSiteZoneStack.zoneId,
    zoneName: projectConfig.staticSiteBaseDomain,
    apiSubDomainName: projectConfig.staticApiSubDomain,
  });
  configureRemoteState(workersDnsStack, 'workers-dns-stack');
  workersDnsStack.addDependency(staticSiteZoneStack);

  // 6. Cloudflare Turnstile スタック
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
  configureRemoteState(turnstileStack, 'turnstile-stack');

  const turnstileWidget = turnstileStack.widgets.get(projectConfig.turnstileId);
  if (!turnstileWidget) {
    throw new Error(`Turnstile widget "${projectConfig.turnstileId}" is not configured.`);
  }

  // 7. Cloudflare Workers スタック - コメント投稿
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
  configureRemoteState(commentsWorkerStack, 'comments-worker-stack');
  commentsWorkerStack.addDependency(queueStack);

  // 8. Cloudflare Workers スタック - 問い合わせフォーム
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
  configureRemoteState(inquiryWorkerStack, 'inquiry-worker-stack');
  inquiryWorkerStack.addDependency(queueStack);

  // 9. Wrangler設定生成（環境ごとに1つの設定）
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
  configureRemoteState(wranglerConfigStack, 'wrangler-config-stack');

  // 10. MonitoringStack（ログ監視）
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
  configureRemoteState(monitoringStack, 'monitoring-stack');

  app.synth();
}

if (require.main === module) {
  main();
}
