import { App } from 'cdktf';
import { stackS3Media } from './stacks/s3-media';
import { stackStaticSite } from './stacks/static-site';
import { stackDynamicSite } from './stacks/dynamic-site';

/**
 * galileo-wp-iac プロジェクトの統合エントリーポイント
 *
 * 3つのインフラ構成を個別にデプロイ:
 * 1. S3 Media: WordPress S3 Media Offload用（S3、CloudFront、Cloudflare CDN）
 * 2. Static Site: 静的サイト配信用（S3、CloudFront、Cloudflare Workers API）
 * 3. Dynamic Site: 動的サイト用（将来実装予定）
 *
 * 環境変数 DEPLOY_TARGET で対象を指定:
 * - "s3-media": S3 Media のみ
 * - "static-site": Static Site のみ
 * - "dynamic-site": Dynamic Site のみ
 * - 未指定または "all": すべて（デフォルト）
 */

function main(): void {
  const target = process.env.DEPLOY_TARGET?.toLowerCase();
  console.log(`Deploy Target: ${target || 'all'}`);

  const app = new App();

  switch (target) {
    case 's3-media':
      stackS3Media(app);
      break;
    case 'static-site':
      stackStaticSite(app);
      break;
    case 'dynamic-site':
      stackDynamicSite(app);
      break;
    case 'all':
    case undefined:
    case '':
      // すべてのスタックを1つのAppに追加
      stackS3Media(app);
      stackStaticSite(app);
      stackDynamicSite(app);
      break;
    default:
      throw new Error(`Unknown DEPLOY_TARGET: ${target}. Valid values are: s3-media, static-site, dynamic-site, all`);
  }

  app.synth();
}

main();
