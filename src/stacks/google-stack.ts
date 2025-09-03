import { TerraformStack, TerraformVariable } from 'cdktf';
import { Construct } from 'constructs';
import { GoogleOAuthSetup } from '../constructs/google-oauth-app';

export interface GoogleStackProps {
  environment: string;
  // tfvars から事前解決した値（Markdown 用に使用）
  resolved?: {
    projectId?: string;
    googleProjectNumber?: string;
    cloudflareTeamDomain?: string;
    domainName?: string;
    subdomainName?: string;
    supportEmail?: string;
    googleClientId?: string;
    googleClientSecret?: string;
  };
}

export class GoogleStack extends TerraformStack {
  constructor(scope: Construct, id: string, props: GoogleStackProps) {
    super(scope, id);

    // 変数定義（tfvars から供給される）
    const googleProjectId = new TerraformVariable(this, 'google_project_id', {
      type: 'string',
      description: 'Google Cloud Project ID',
      default: 'my-google-oauth-project',
    });

    const cloudflareTeamDomain = new TerraformVariable(this, 'cloudflare_team_domain', {
      type: 'string',
      description: 'Cloudflare Zero Trust チームドメイン（リダイレクトURIで使用）',
      default: 'my-team',
    });

    const domainName = new TerraformVariable(this, 'domain_name', {
      type: 'string',
      description: 'ベースドメイン名（例: example.com）',
    });

    const subdomainName = new TerraformVariable(this, 'subdomain_name', {
      type: 'string',
      description: 'サブドメイン名（例: app）',
    });

    const supportEmail = new TerraformVariable(this, 'support_email', {
      type: 'string',
      description: 'OAuth同意画面用のサポートメールアドレス（必須）',
    });

    const googleClientId = new TerraformVariable(this, 'google_client_id', {
      type: 'string',
      description: 'Google OAuth Client ID（設定検証用）',
      sensitive: false,
    });

    const googleClientSecret = new TerraformVariable(this, 'google_client_secret', {
      type: 'string',
      description: 'Google OAuth Client Secret（設定検証用）',
      sensitive: true,
    });

    // Google OAuth 設定ガイダンス（検証とガイダンスのみ）
    // Markdown 生成には実値を優先（なければ Token を使用）
    new GoogleOAuthSetup(this, 'google_oauth_setup', {
      projectId: props.resolved?.projectId || googleProjectId.stringValue,
      projectNumber: props.resolved?.googleProjectNumber,
      displayName: 'Google OAuth Integration Service',
      cloudflareTeamName: props.resolved?.cloudflareTeamDomain || cloudflareTeamDomain.stringValue,
      environment: props.environment,
      domainName: props.resolved?.domainName || domainName.stringValue,
      subdomainName: props.resolved?.subdomainName || subdomainName.stringValue,
      supportEmail: props.resolved?.supportEmail || supportEmail.stringValue,
      googleClientId: props.resolved?.googleClientId || googleClientId.stringValue,
      googleClientSecret: props.resolved?.googleClientSecret || googleClientSecret.stringValue,
    });
  }
}
