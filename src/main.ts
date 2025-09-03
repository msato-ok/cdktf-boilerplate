import { App, LocalBackend } from 'cdktf';
import * as fs from 'fs';
import { runCfAutoImport } from './cloudflare/auto-import';
// Google 認証ユーティリティ（現行フローでは直接使用しない）
// import { checkGoogleAuthStatus, validateGoogleAuth } from './shared/google-auth-validator';
import { AwsSgEnforceInlineStack } from './stacks/aws-sg-enforce-inline-stack';
import { CloudflareStack } from './stacks/cloudflare-stack';
import { GoogleStack } from './stacks/google-stack';
import { loadGoogleConfig } from './shared/tfvars';
import { parseSimpleTfvars } from './shared/tfvars';

function requireEnv(name: string): string {
  const v = process.env[name];
  if (!v || v.trim() === '') {
    throw new Error(`必須環境変数が未設定です: ${name}`);
  }
  return v;
}

function ensureAwsAuth(): void {
  const hasProfile = !!process.env.AWS_PROFILE && process.env.AWS_PROFILE.trim() !== '';
  const hasKeys =
    !!process.env.AWS_ACCESS_KEY_ID &&
    process.env.AWS_ACCESS_KEY_ID.trim() !== '' &&
    !!process.env.AWS_SECRET_ACCESS_KEY &&
    process.env.AWS_SECRET_ACCESS_KEY.trim() !== '';
  if (!hasProfile && !hasKeys) {
    throw new Error(
      'AWS 認証情報が未設定です: AWS_PROFILE もしくは AWS_ACCESS_KEY_ID/AWS_SECRET_ACCESS_KEY（必要に応じて AWS_SESSION_TOKEN）を設定してください',
    );
  }
}

async function main(): Promise<void> {
  const app = new App();

  // 必須: ENVIRONMENT（dev|prod など）
  const environment = requireEnv('ENVIRONMENT');

  // 必須: STACK（cloudflare | google | aws-sg-enforce-inline）
  const stackTarget = requireEnv('STACK').toLowerCase();
  if (!['cloudflare', 'google', 'aws-sg-enforce-inline'].includes(stackTarget)) {
    throw new Error('STACK は "cloudflare", "google", もしくは "aws-sg-enforce-inline" を指定してください');
  }

  // terraform.<ENV>.tfvars（または terraform.tfvars）から必須キーの存在を検証
  function validateTfvars(requiredKeys: string[]): void {
    const primary = `terraform.${environment}.tfvars`;
    const fallback = 'terraform.tfvars';
    const tfvarsPath = fs.existsSync(primary) ? primary : fs.existsSync(fallback) ? fallback : undefined;
    if (!tfvarsPath) {
      throw new Error(`設定ファイルが見つかりません: ${primary} または ${fallback}`);
    }
    const content = fs.readFileSync(tfvarsPath, 'utf8');

    // シンプルな tfvars パーサでキー存在と値を取得（ダブルクォートは除去される）
    const kv: Record<string, string> = parseSimpleTfvars(content);
    const missing: string[] = [];
    const empty: string[] = [];
    for (const k of requiredKeys) {
      if (!(k in kv)) {
        missing.push(k);
      } else {
        const v = (kv[k] ?? '').trim();
        if (v === '') empty.push(k);
      }
    }
    if (missing.length || empty.length) {
      const parts: string[] = [];
      if (missing.length) parts.push(`不足キー: ${missing.join(', ')}`);
      if (empty.length) parts.push(`空文字のキー: ${empty.join(', ')}`);
      throw new Error(`tfvars の検証に失敗しました (${tfvarsPath})。${parts.join(' / ')}`);
    }
  }

  if (stackTarget === 'cloudflare') {
    validateTfvars([
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

  if (stackTarget === 'google') {
    validateTfvars([
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

  if (stackTarget === 'aws-sg-enforce-inline') {
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
  if (stackTarget === 'cloudflare') {
    await runCfAutoImport();
  }
}

// 実行
main().catch(e => {
  console.error(String(e instanceof Error ? e.message : e));
  process.exitCode = 1;
});
