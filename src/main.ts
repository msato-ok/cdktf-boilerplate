import { App, LocalBackend } from 'cdktf';
import {
  AwsSgEnforceInlineStack,
  CloudflareStack,
  GoogleStack,
  loadGoogleConfig,
  runCfAutoImport,
  requireEnv,
  ensureAwsAuth,
  requireProjectConfig,
} from '@minr-dev/cdktf-toolkit';

async function main(): Promise<void> {
  const app = new App();

  const projectConfig = requireProjectConfig();
  const { environment, stack } = projectConfig;

  if (stack === 'cloudflare') {
    projectConfig.ensureTfvarsKeys([
      'cloudflare_api_token',
      'cloudflare_account_id',
      'domain_name',
      'subdomain_name',
      'target_ip_address',
      'google_client_id',
      'google_client_secret',
      'allowed_email_domain',
    ]);
    const cf = new CloudflareStack(app, 'cloudflare', { environment });
    new LocalBackend(cf, { path: `./terraform-state/${cf.node.id}/${environment}/terraform.tfstate` });
  }

  if (stack === 'google') {
    projectConfig.ensureTfvarsKeys([
      'google_project_id',
      'cloudflare_team_domain',
      'domain_name',
      'subdomain_name',
      'google_client_id',
      'google_client_secret',
    ]);

    // Quiet mode: avoid verbose console logs; guidance is written to Markdown.
    // tfvars から実値を読み込み、Markdown には実値を使う
    const resolved = loadGoogleConfig(environment);
    const google = new GoogleStack(app, 'google', { environment, resolved });
    new LocalBackend(google, { path: `./terraform-state/${google.node.id}/${environment}/terraform.tfstate` });
  }

  if (stack === 'aws-sg-enforce-inline') {
    requireEnv('SG_ID');
    ensureAwsAuth();

    const enforce = new AwsSgEnforceInlineStack(app, 'aws-sg-enforce-inline');
    new LocalBackend(enforce, { path: `./terraform-state/${enforce.node.id}/${environment}/terraform.tfstate` });
  }

  app.synth();

  // Cloudflare の場合は、合成直後に毎回 import を実行する
  // 目的:
  //   - Terraform/Tofu は Cloudflare Access アプリの既存実体との「同期」をサポートしていないため、
  //     すでに存在する実体を Terraform state に取り込み、デプロイ状態をこちらで一元管理する。
  // 効果（副次）:
  //   - 既存リソースと state の ID 不一致に起因する apply 失敗を未然に防ぐ。
  // 方法:
  //   - 合成直後の cdk.tf.json を基に、URL（=サブドメイン）完全一致で Access アプリを特定し、state に import。
  //   - DNS レコードについても同様に既存実体を特定・import して整合性を確保。
  if (stack === 'cloudflare') {
    await runCfAutoImport({ environment });
  }
}

// 実行
main().catch(e => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exitCode = 1;
});
