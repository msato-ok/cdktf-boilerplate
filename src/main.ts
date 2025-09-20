import { App, LocalBackend } from 'cdktf';
import {
  AwsSgEnforceInlineStack,
  CloudflareStack,
  GoogleStack,
  runCfAutoImport,
  requireEnv,
  ensureAwsAuth,
} from '@minr-dev/cdktf-toolkit';

async function main(): Promise<void> {
  const app = new App();
  const environment = requireEnv('ENVIRONMENT');

  // 実行フロー: 複数のスタックを順番に実行

  // 1. Google OAuth設定スタック
  const google = new GoogleStack(app, 'google', { environment });
  new LocalBackend(google, { path: `./terraform-state/${google.node.id}/${environment}/terraform.tfstate` });

  // 2. Cloudflareスタック
  const cf = new CloudflareStack(app, 'cloudflare', { environment });
  new LocalBackend(cf, { path: `./terraform-state/${cf.node.id}/${environment}/terraform.tfstate` });

  // 3. AWS Security Group設定スタック（必要に応じて）
  const sgId = process.env.SG_ID;
  if (sgId) {
    ensureAwsAuth();
    const enforce = new AwsSgEnforceInlineStack(app, 'aws-sg-enforce-inline');
    new LocalBackend(enforce, { path: `./terraform-state/${enforce.node.id}/${environment}/terraform.tfstate` });
  }

  app.synth();

  // 4. Cloudflare自動インポート実行
  await runCfAutoImport({ environment });
}

// 実行
main().catch(e => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exitCode = 1;
});
