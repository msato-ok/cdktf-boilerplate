import { requireEnv } from '@minr-dev/cdktf-toolkit';

/**
 * galileo-wp-iac プロジェクト固有の設定
 */
export interface ProjectConfig {
  environment: 'prod' | 'dev';
  awsRegion: string;
  cdnBaseDomain: string;
  cdnSubDomain: string;
  cdnBucketName: string;
  cdnOacName: string;
  iamPolicyName: string;
  iamUserName: string;
  workerSqsUserName: string;
  workerSqsPolicyName: string;
  staticSiteBaseDomain: string;
  staticSiteSubDomain: string;
  staticSiteBucketName: string;
  staticSiteOacName: string;
  staticSiteDeployUserName: string;
  staticSiteDeployPolicyName: string;
  turnstileId: string;
  turnstileName: string;
  commentsQueueName: string;
  commentsQueueId: string;
  inquiryQueueName: string;
  inquiryQueueId: string;
  workerSqsPolicyId: string;
  workerSqsUserId: string;
}

const ENVIRONMENTS = {
  PROD: 'prod',
  DEV: 'dev',
} as const;
type ENVIRONMENTS = (typeof ENVIRONMENTS)[keyof typeof ENVIRONMENTS];

/**
 * 環境変数からProjectConfigを構築
 */
export function buildProjectConfig(): ProjectConfig {
  const environmentValue = requireEnv('ENVIRONMENT');
  const environment = environmentValue as ENVIRONMENTS;
  const validEnvironments = new Set(Object.values(ENVIRONMENTS));
  if (!validEnvironments.has(environment)) {
    throw new Error(`不明な環境です: ${environmentValue}`);
  }

  return {
    environment,
    awsRegion: requireEnv('AWS_REGION'),
    cdnBaseDomain: requireEnv('S3_MEDIA_CDN_DOMAIN'),
    cdnSubDomain: requireEnv('S3_MEDIA_CDN_SUBDOMAIN'),
    cdnBucketName: requireEnv('S3_MEDIA_BUCKET_NAME'),
    cdnOacName: `media-oac-${environment}`,
    iamPolicyName: `GalileoRentMediaPolicy-${environment}`,
    iamUserName: `galileo-rent-media-user-${environment}`,
    workerSqsUserName: `galileo-rent-sqs-user-${environment}`,
    workerSqsPolicyName: `GalileoRentSqsPolicy-${environment}`,
    staticSiteBaseDomain: requireEnv('STATIC_SITE_DOMAIN'),
    staticSiteSubDomain: requireEnv('STATIC_SITE_SUBDOMAIN'),
    staticSiteBucketName: requireEnv('STATIC_SITE_BUCKET_NAME'),
    staticSiteOacName: `static-site-oac-${environment}`,
    staticSiteDeployUserName: `galileo-rent-static-site-deploy-user-${environment}`,
    staticSiteDeployPolicyName: `GalileoRentStaticSiteDeployPolicy-${environment}`,
    turnstileId: `galileo-rent-turnstile-${environment}`,
    turnstileName: `galileo-rent-turnstile-${environment}`,
    commentsQueueName: `wp-comment-ingest-${environment}`,
    commentsQueueId: `wp-comment-ingest-${environment}`,
    inquiryQueueName: `wp-inquiry-${environment}`,
    inquiryQueueId: `wp-inquiry-${environment}`,
    workerSqsPolicyId: 'worker_sqs_policy',
    workerSqsUserId: 'worker_sqs_user',
  };
}
