import { App, LocalBackend } from 'cdktf';
import {
  AwsSgEnforceInlineStack,
  CloudflareZeroTrustStack,
  CLOUDFLARE_ORIGIN_TYPE,
  runCfAutoImport,
  requireEnv,
  ensureAwsAuth,
} from '@minr-dev/cdktf-toolkit';

async function main(): Promise<void> {
  const app = new App();
  const environment = requireEnv('ENVIRONMENT');

  // 2. Cloudflareスタック（HTTPオリジン用）
  const cf = new CloudflareZeroTrustStack(app, 'cloudflare', {
    environment,
    originType: CLOUDFLARE_ORIGIN_TYPE.HTTP
  });
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
