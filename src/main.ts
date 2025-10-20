import { App } from 'cdktf';
import { deployS3Media } from './flows/s3-media';
import { deployStaticSite } from './flows/static-site';
import { deployJamstackApi } from './flows/jamstack-api';
import { deployDynamicSite } from './flows/dynamic-site';

/**
 * galileo-wp-iac プロジェクトの統合エントリーポイント
 *
 * 4つのインフラ構成を個別にデプロイ:
 * 1. S3 Media: WordPress S3 Media Offload用（S3、CloudFront、Cloudflare CDN）
 * 2. Static Site: 静的サイト配信用（S3、CloudFront、Cloudflare DNS）
 * 3. Jamstack API: Jamstack API用（Cloudflare Workers、SQS、Turnstile）
 * 4. Dynamic Site: 動的サイト用（将来実装予定）
 *
 * 環境変数 DEPLOY_TARGET で対象を指定:
 * - "s3-media": S3 Media のみ
 * - "static-site": Static Site のみ
 * - "jamstack-api": Jamstack API のみ
 * - "static-full": Static Site + Jamstack API（静的サイト全体）
 * - "dynamic-site": Dynamic Site のみ
 * - 未指定または "all": すべて（デフォルト）
 */

function main(): void {
  const target = process.env.DEPLOY_TARGET?.toLowerCase();
  console.log(`Deploy Target: ${target || 'all'}`);

  const app = new App();

  switch (target) {
    case 's3-media':
      deployS3Media(app);
      break;
    case 'static-site':
      deployStaticSite(app);
      break;
    case 'jamstack-api': {
      // Jamstack APIは静的サイトのZone IDが必要なため、先に静的サイトをデプロイ
      const { zoneId, zoneStack } = deployStaticSite(app);
      deployJamstackApi(app, zoneId, zoneStack);
      break;
    }
    case 'static-full': {
      // 静的サイトとJamstack APIを両方デプロイ
      const { zoneId, zoneStack } = deployStaticSite(app);
      deployJamstackApi(app, zoneId, zoneStack);
      break;
    }
    case 'dynamic-site':
      deployDynamicSite(app);
      break;
    case 'all':
    case undefined:
    case '': {
      // すべてのスタックを1つのAppに追加
      deployS3Media(app);
      const { zoneId, zoneStack } = deployStaticSite(app);
      deployJamstackApi(app, zoneId, zoneStack);
      deployDynamicSite(app);
      break;
    }
    default:
      throw new Error(
        `Unknown DEPLOY_TARGET: ${target}. Valid values are: s3-media, static-site, jamstack-api, static-full, dynamic-site, all`,
      );
  }

  app.synth();
}

main();
