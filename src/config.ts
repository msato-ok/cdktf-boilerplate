import { requireEnv } from '@minr-dev/cdktf-toolkit';

/**
 * S3 Media Offload（WordPress メディア配信）用設定
 */
export interface S3MediaConfig {
  /** メディア配信用ベースドメイン（例: example.com） */
  baseDomain: string;
  /** メディア配信用サブドメイン（例: media） */
  subDomain: string;
  /** メディア配信用 S3 バケット名 */
  bucketName: string;
  /** メディア配信用 CloudFront OAC 名 */
  oacName: string;
  /** メディア配信用 IAM ポリシー名 */
  iamPolicyName: string;
  /** メディア配信用 IAM ユーザー名（WordPress からのアップロード用） */
  iamUserName: string;
}

/**
 * 静的コンテンツ配信用設定（HTML/CSS/JS）
 */
export interface StaticContentConfig {
  /** 静的サイト用ベースドメイン（例: example.com） */
  baseDomain: string;
  /** 静的サイト用サブドメイン（例: www） */
  subDomain: string;
  /** 静的サイト用 S3 バケット名 */
  bucketName: string;
  /** 静的サイト用 CloudFront OAC 名 */
  oacName: string;
  /** 静的サイトデプロイ用 IAM ユーザー名 */
  deployUserName: string;
  /** 静的サイトデプロイ用 IAM ポリシー名 */
  deployPolicyName: string;
}

/**
 * Jamstack API 用設定（Cloudflare Workers + SQS）
 */
export interface JamstackApiConfig {
  /** 静的サイト用ベースドメイン（Workers Routes のベース、例: example.com） */
  baseDomain: string;
  /** API エンドポイント用サブドメイン（例: api, www-api）- Workers Routes 用 */
  apiSubDomain: string;
  /** Cloudflare Turnstile ウィジェット ID */
  turnstileId: string;
  /** Cloudflare Turnstile ウィジェット名 */
  turnstileName: string;
  /** Workers から SQS アクセス用 IAM ユーザー名 */
  workerSqsUserName: string;
  /** Workers から SQS アクセス用 IAM ポリシー名 */
  workerSqsPolicyName: string;
  /** コメント投稿用 SQS キュー名 */
  commentsQueueName: string;
  /** 問い合わせフォーム用 SQS キュー名 */
  inquiryQueueName: string;
  /** Worker エラーログ通知用 SQS キュー名 */
  notificationQueueName: string;
}

/**
 * galileo-wp-iac プロジェクト固有の設定
 *
 * デプロイフローごとにグループ化:
 * - s3Media: S3 Media Offload フロー用設定（deployS3Media）
 * - staticContent: 静的コンテンツ配信フロー用設定（deployStaticSite の S3/CloudFront 部分）
 * - jamstackApi: Jamstack API フロー用設定（deployStaticSite の Workers/SQS 部分）
 * - monitoring: Cloudflare 監視設定（Notification Policy）
 */
export interface ProjectConfig {
  /** デプロイ環境（prod: 本番, dev: 開発） */
  environment: 'prod' | 'dev';
  /** AWS リージョン（例: ap-northeast-1） */
  awsRegion: string;
  /** アプリケーション名（リソース命名のプレフィックス、例: galileo-rent） */
  appName: string;
  /** アラート通知先メールアドレス一覧 */
  alertEmails: string[];
  /** S3 Media Offload フロー用設定 */
  s3Media: S3MediaConfig;
  /** 静的コンテンツ配信フロー用設定（HTML/CSS/JS） */
  staticSite: StaticContentConfig;
  /** Jamstack API フロー用設定（Workers + SQS） */
  jamstackApi: JamstackApiConfig;
}

const ENVIRONMENTS = {
  PROD: 'prod',
  DEV: 'dev',
} as const;
type ENVIRONMENTS = (typeof ENVIRONMENTS)[keyof typeof ENVIRONMENTS];

/**
 * Terraform Backend 設定
 */
export interface BackendConfig {
  stateBucket: string;
  stateDynamodbTable: string;
  stateRegion: string;
  stateKeyPrefix: string;
  environment: string;
}

/**
 * Terraform Backend 設定を構築
 */
export function buildBackendConfig(environment: string, awsRegion: string): BackendConfig {
  return {
    stateBucket: 'galileo-rent-terraform-state',
    stateDynamodbTable: 'galileo-rent-terraform-lock',
    stateRegion: awsRegion,
    stateKeyPrefix: 'galileo-rent',
    environment,
  };
}

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

  const baseDomain = requireEnv('STATIC_SITE_DOMAIN');
  const appName = requireEnv('APP_NAME');
  const appNameKebab = appName.toLowerCase().replace(/[_]/g, '-');
  const appNamePascal = appNameKebab
    .split(/[-]/)
    .map(part => part.charAt(0).toUpperCase() + part.slice(1))
    .join('');

  if (!/^[a-zA-Z][a-zA-Z0-9-_]{2,30}$/.test(appNameKebab)) {
    throw new Error('APP_NAME は英数字、ハイフン、アンダースコアを含む3～30文字で、英字で始まる必要があります。');
  }

  return {
    environment,
    awsRegion: requireEnv('AWS_REGION'),
    appName: appNameKebab,
    alertEmails: parseEmailList(requireEnv('CLOUDFLARE_ALERT_EMAILS')),
    s3Media: {
      baseDomain: requireEnv('S3_MEDIA_CDN_DOMAIN'),
      subDomain: requireEnv('S3_MEDIA_CDN_SUBDOMAIN'),
      bucketName: requireEnv('S3_MEDIA_BUCKET_NAME'),
      oacName: `media-oac-${environment}`,
      iamPolicyName: `${appNamePascal}MediaPolicy-${environment}`,
      iamUserName: `${appNameKebab}-media-user-${environment}`,
    },
    staticSite: {
      baseDomain,
      subDomain: requireEnv('STATIC_SITE_SUBDOMAIN'),
      bucketName: requireEnv('STATIC_SITE_BUCKET_NAME'),
      oacName: `static-site-oac-${environment}`,
      deployUserName: `${appNameKebab}-static-site-deploy-user-${environment}`,
      deployPolicyName: `${appNamePascal}StaticSiteDeployPolicy-${environment}`,
    },
    jamstackApi: {
      baseDomain,
      apiSubDomain: requireEnv('STATIC_API_SUBDOMAIN'),
      turnstileId: `${appNameKebab}-turnstile-${environment}`,
      turnstileName: `${appNameKebab}-turnstile-${environment}`,
      workerSqsUserName: `${appNameKebab}-jamstack-worker-sqs-user-${environment}`,
      workerSqsPolicyName: `${appNamePascal}JamstackWorkerSqsPolicy-${environment}`,
      commentsQueueName: `wp-comment-ingest-${environment}`,
      inquiryQueueName: `wp-inquiry-${environment}`,
      notificationQueueName: `wp-worker-notification-${environment}`,
    },
  };
}
function parseEmailList(raw: string): string[] {
  return raw
    .split(',')
    .map(value => value.trim())
    .filter(value => value.length > 0);
}
