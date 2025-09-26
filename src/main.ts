import { App, S3Backend } from 'cdktf';
import {
  AwsS3MediaStack,
  CloudflareMediaStack,
  ensureAwsAuth,
  requireEnv,
} from '@minr-dev/cdktf-toolkit';

/**
 * galileo-wp-iac プロジェクト固有のメイン実行フロー
 *
 * WordPress S3 Media Offload用インフラを以下の順序でデプロイ:
 * 1. AWS S3 Media Stack: S3バケット、CloudFront、IAMリソース
 * 2. Cloudflare Media Stack: CDN配信用DNS、TLS設定
 *
 * 環境は実行時のディレクトリまたはコマンドライン引数で指定
 */
interface ProjectConfig {
  environment: 'prod' | 'dev';
  awsRegion: string;
  baseDomain: string;
  subDomain: string;
  bucketName: string;
  iamPolicyName: string;
  iamUserName: string;
}

const ENVIRONMENTS = {
  PROD: 'prod',
  DEV: 'dev',
} as const;
type ENVIRONMENTS = typeof ENVIRONMENTS[keyof typeof ENVIRONMENTS];

function buildProjectConfig(): ProjectConfig {
  const environmentValue = requireEnv('ENVIRONMENT');
  const environment = environmentValue as ENVIRONMENTS;
  const validEnvironments = new Set(Object.values(ENVIRONMENTS));
  if (!validEnvironments.has(environment)) {
    throw new Error(`不明な環境です: ${environmentValue}`);
  }

  return {
    environment,
    awsRegion: requireEnv('AWS_REGION'),
    baseDomain: requireEnv('S3_MEDIA_CDN_DOMAIN'),
    subDomain: requireEnv('S3_MEDIA_CDN_SUBDOMAIN'),
    bucketName: requireEnv('S3_MEDIA_BUCKET_NAME'),
    iamPolicyName: `GalileoRentMediaPolicy-${environment}`,
    iamUserName: `galileo-rent-media-user-${environment}`,
  };
}

function main(): void {
  const projectConfig = buildProjectConfig();
  const { environment } = projectConfig;
  console.log(`Environment: ${environment}`);

  const app = new App();


  // AWS認証確認
  ensureAwsAuth();

  // S3Backend（TerraformのステートをS3に保持）用の設定
  const stateBucket = "galileo-rent-terraform-state";
  const stateDynamodbTable = "galileo-rent-terraform-lock";
  const stateRegion = projectConfig.awsRegion;
  const stateKeyPrefix = 'galileo-rent';

  const backendKeyFor = (stackId: string) => `${stateKeyPrefix}/${environment}/${stackId}.tfstate`;

  const configureRemoteState = (stack: AwsS3MediaStack | CloudflareMediaStack, stackId: string) => {
    new S3Backend(stack, {
      bucket: stateBucket,
      key: backendKeyFor(stackId),
      region: stateRegion,
      dynamodbTable: stateDynamodbTable,
      encrypt: true,
    });
  };

  const { baseDomain, subDomain } = projectConfig;
  const cdnDomain = `${subDomain}.${baseDomain}`;

  // 1. AWS S3 Media スタック
  const awsS3MediaStack = new AwsS3MediaStack(app, 'aws-s3-media-stack', {
    environment,
    bucketName: projectConfig.bucketName,
    cdnDomain,
    awsRegion: projectConfig.awsRegion,
    iamPolicyName: projectConfig.iamPolicyName,
    iamUserName: projectConfig.iamUserName,
  });
  configureRemoteState(awsS3MediaStack, 'aws-s3-media-stack');

  // 2. Cloudflare Media スタック（AWS S3 Media Stackの出力値を使用）
  const cloudflareMediaStack = new CloudflareMediaStack(app, 'cloudflare-media-stack', {
    environment,
    domainName: baseDomain,
    subDomainName: subDomain,
    cloudfrontDomainName: awsS3MediaStack.cloudfrontDomainName,
    acmValidationRecord: awsS3MediaStack.acmValidationRecord,
  });
  configureRemoteState(cloudflareMediaStack, 'cloudflare-media-stack');

  // スタック間の依存関係を明示的に定義
  cloudflareMediaStack.addDependency(awsS3MediaStack);

  app.synth();
}

if (require.main === module) {
  main();
}
