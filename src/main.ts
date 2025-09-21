import { App, LocalBackend } from 'cdktf';
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
  const app = new App();

  // 環境を引数またはデフォルトから決定
  const environment = process.argv[2] || 'dev';
  console.log(`Environment: ${environment}`);

  // プロジェクト設定の検証
  requireProjectConfig(environment);

  // AWS認証確認
  ensureAwsAuth();

  // 1. AWS S3 Media スタック
  const awsS3MediaStack = new AwsS3MediaStack(app, 'aws-s3-media-stack', {
    environment,
    priceClass: 'PriceClass_200', // アジア・パシフィック地域最適化
  });
  new LocalBackend(awsS3MediaStack, {
    path: `./terraform/${awsS3MediaStack.node.id}/${environment}/terraform.tfstate`,
  });

  // 2. Cloudflare Media スタック（AWS S3 Media Stackの出力値を使用）
  const cloudflareMediaStack = new CloudflareMediaStack(app, 'cloudflare-media-stack', {
    environment,
    cloudfrontDomainName: awsS3MediaStack.cloudfrontDomainName,
    acmValidationRecords: awsS3MediaStack.acmValidationRecords,
  });
  new LocalBackend(cloudflareMediaStack, {
    path: `./terraform/${cloudflareMediaStack.node.id}/${environment}/terraform.tfstate`,
  });

  app.synth();
}

if (require.main === module) {
  main();
}
