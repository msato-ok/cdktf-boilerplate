import { App, S3Backend } from 'cdktf';
import { AwsS3MediaStack, CloudflareMediaStack, requireProjectConfig, ensureAwsAuth } from '@minr-dev/cdktf-toolkit';

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
  // 環境を引数またはデフォルトから決定
  const environment = process.argv[2] || 'dev';
  console.log(`Environment: ${environment}`);

  const app = new App();

  // プロジェクト設定の検証
  const projectConfig = requireProjectConfig(environment);

  // AWS認証確認
  ensureAwsAuth();

  // S3Backend（TerraformのステートをS3に保持）用の設定
  const stateBucket = "galileo-rent-terraform-state";
  const stateDynamodbTable = "galileo-rent-terraform-lock";
  const stateRegion = process.env.AWS_REGION || 'ap-northeast-1';
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

  let baseDomain: string;
  let subDomain: string;
  if (environment === 'prod') {
    baseDomain = 'galileo.rent';
    subDomain = 'galileo.rent';
  } else if (environment === 'dev'){
    baseDomain = `a5g.io`;
    subDomain = 'galileo-cdn-dev2';
  } else {
    throw new Error(`不明な値です: ${environment}`);
  }

  // 1. AWS S3 Media スタック
  const awsS3MediaStack = new AwsS3MediaStack(app, 'aws-s3-media-stack', {
    environment,
    bucketName: `galileo-rent-media-${environment}`,
    cdnDomain: `${subDomain}.${baseDomain}`,
    awsRegion: process.env.AWS_REGION || 'ap-northeast-1',
    iamPolicyName: `GalileoRentMediaPolicy-${environment}`,
    iamUserName: `galileo-rent-media-user-${environment}`,
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
