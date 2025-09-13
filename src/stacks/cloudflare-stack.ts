import { DataCloudflareZones } from '@cdktf/provider-cloudflare/lib/data-cloudflare-zones';
import { CloudflareProvider } from '@cdktf/provider-cloudflare/lib/provider';
import { ZoneSetting } from '@cdktf/provider-cloudflare/lib/zone-setting';
import { TerraformStack, TerraformVariable } from 'cdktf';
import { Construct } from 'constructs';
import { ZeroTrustAccess } from '../constructs/zero-trust-access';
import { ZoneSubdomain } from '../constructs/zone-subdomain';

export interface CloudflareStackProps {
  environment: string;
}

export class CloudflareStack extends TerraformStack {
  constructor(scope: Construct, id: string, props: CloudflareStackProps) {
    super(scope, id);

    // 変数定義（tfvars から供給される）
    const cloudflareApiToken = new TerraformVariable(this, 'cloudflare_api_token', {
      type: 'string',
      description: 'Cloudflare API トークン（Zone:Edit と Access:Edit 権限を付与）',
      sensitive: true,
    });

    const cloudflareAccountId = new TerraformVariable(this, 'cloudflare_account_id', {
      type: 'string',
      description: 'Cloudflare アカウントID',
    });

    const domainName = new TerraformVariable(this, 'domain_name', {
      type: 'string',
      description: 'ベースドメイン名（例: a5g.io）',
    });

    const subdomainName = new TerraformVariable(this, 'subdomain_name', {
      type: 'string',
      description: 'サブドメイン名（例: hp）',
    });

    const targetIpAddress = new TerraformVariable(this, 'target_ip_address', {
      type: 'string',
      description: 'プロキシ先のターゲットIPv4アドレス',
    });

    const googleClientId = new TerraformVariable(this, 'google_client_id', {
      type: 'string',
      description: 'Google OAuth クライアントID',
      sensitive: true,
    });

    const googleClientSecret = new TerraformVariable(this, 'google_client_secret', {
      type: 'string',
      description: 'Google OAuth クライアントシークレット',
      sensitive: true,
    });

    const allowedEmailDomain = new TerraformVariable(this, 'allowed_email_domain', {
      type: 'string',
      description: 'アクセス許可するメールドメイン（例: yourcompany.com）',
    });

    // Note: ENVIRONMENT は CDKTF アプリ側（Node）でのみ使用します。
    // Terraform 側の tfvars には含めないでください。

    // プロバイダ設定（tfvars の値を使用）
    new CloudflareProvider(this, 'cloudflare', {
      apiToken: cloudflareApiToken.stringValue,
    });

    // ゾーン情報を取得
    const zone = new DataCloudflareZones(this, 'zone', {
      name: domainName.stringValue,
    });

    // SSL/TLS 設定を Flexible に設定（オリジンが HTTP の場合）
    // 注意: cloudflare_zone_setting の value は実際にはプリミティブ値（"off"|"flexible"|"full"|"strict"）を期待します。
    // CDKTF の型上はマップになっていますが、文字列を直接渡す必要があります。
    new ZoneSetting(this, 'ssl_tls_setting', {
      zoneId: zone.result.get(0).id,
      settingId: 'ssl',
      // 型定義の都合で any キャストし、文字列を直接指定
      value: 'flexible' as any,
    });

    // プロキシ有効のサブドメインを作成
    new ZoneSubdomain(this, 'hp_subdomain', {
      domainName: domainName.stringValue,
      subdomainName: subdomainName.stringValue,
      targetIpAddress: targetIpAddress.stringValue,
      proxied: true,
      environment: props.environment,
    });

    // Zero Trust のアクセス制御を作成
    new ZeroTrustAccess(this, 'hp_access', {
      accountId: cloudflareAccountId.stringValue,
      domainName: domainName.stringValue,
      subdomainName: subdomainName.stringValue,
      googleClientId: googleClientId.stringValue,
      googleClientSecret: googleClientSecret.stringValue,
      allowedEmailDomain: allowedEmailDomain.stringValue,
      environment: props.environment,
    });

    // 備考: クライアント証明書などの導入なしでプロキシ経由のみを強制する場合は、
    // オリジンのFWで Cloudflare 公開IPのみ許可する運用を併用してください。
  }
}
