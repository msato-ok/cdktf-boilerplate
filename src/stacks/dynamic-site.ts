import { App } from 'cdktf';
import { ensureAwsAuth } from '@minr-dev/cdktf-toolkit';
import { buildProjectConfig } from '../config';

/**
 * 動的サイト（WordPress等）用インフラのメイン実行フロー
 *
 * 将来実装予定:
 * - EC2/ECS/Fargate によるアプリケーションサーバー
 * - RDS/Aurora によるデータベース
 * - ElastiCache によるキャッシュ
 * - ALB/NLB によるロードバランサー
 * - Cloudflare による CDN/WAF
 */
export function stackDynamicSite(app: App): void {
  const projectConfig = buildProjectConfig();
  const { environment } = projectConfig;
  console.log(`[Dynamic Site] Environment: ${environment}`);

  // AWS認証確認
  ensureAwsAuth();

  // TODO: 動的サイト用のスタックを実装
  console.log('動的サイト用のインフラはまだ実装されていません。');
}
