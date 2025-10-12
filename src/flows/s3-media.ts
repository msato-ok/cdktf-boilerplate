import { App } from 'cdktf';
import { StaticContentStack, CloudflareMediaStack, ensureAwsAuth } from '@minr-dev/cdktf-toolkit';
import { buildProjectConfig } from '../config';
import { configureRemoteState } from '../shared/backend-helper';

/**
 * S3 Media Offload用インフラのデプロイフロー
 *
 * WordPress S3 Media Offload用インフラを以下の順序でデプロイ:
 * 1. AWS S3 Media Stack: S3バケット、CloudFront、IAMリソース
 * 2. Cloudflare Media Stack: CDN配信用DNS、TLS設定
 */
export function deployS3Media(app: App): void {
  const projectConfig = buildProjectConfig();
  const { environment } = projectConfig;
  console.log(`[S3 Media] Environment: ${environment}`);

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

  const cdnFqdn = `${projectConfig.cdnSubDomain}.${projectConfig.cdnBaseDomain}`;

  // 1. AWS S3 Media スタック（StaticContentStack の S3 メディア用ファクトリーで構築）
  const awsS3MediaStack = StaticContentStack.createForS3Media(app, 'aws-s3-media-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    bucketName: projectConfig.cdnBucketName,
    customDomain: cdnFqdn,
    oacName: projectConfig.cdnOacName,
    deployUserName: projectConfig.iamUserName,
    deployPolicyName: projectConfig.iamPolicyName,
  });

  configureRemoteState(awsS3MediaStack, {
    ...backendConfig,
    stackId: 'aws-s3-media-stack',
  });

  // 2. Cloudflare Media スタック（AWS S3 Media Stackの出力値を使用）
  // S3 Media では customDomain を必ず設定するため、acmValidationRecord は常に存在する
  if (!awsS3MediaStack.acmValidationRecord) {
    throw new Error('ACM validation record is required for S3 Media stack');
  }

  const cloudflareMediaStack = new CloudflareMediaStack(app, 'cloudflare-media-stack', {
    environment,
    domainName: projectConfig.cdnBaseDomain,
    subDomainName: projectConfig.cdnSubDomain,
    cloudfrontDomainName: awsS3MediaStack.cloudfrontDomainName,
    acmValidationRecord: awsS3MediaStack.acmValidationRecord,
  });
  configureRemoteState(cloudflareMediaStack, {
    ...backendConfig,
    stackId: 'cloudflare-media-stack',
  });

  // スタック間の依存関係を明示的に定義
  cloudflareMediaStack.addDependency(awsS3MediaStack);
}
