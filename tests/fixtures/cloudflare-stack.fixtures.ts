/**
 * CloudflareStackテスト用のfixtureデータ
 * 各テストケースで使用する共通データの重複定義を排除
 */

// 環境設定のベースフィクスチャ
export const environmentFixtures = {
  test: 'test',
  production: 'production',
  staging: 'staging',
  resourceTest: 'resource-test',
  variableTest: 'variable-test',
  securityTest: 'security-test',
  providerTest: 'provider-test',
} as const;

// 期待されるTerraformリソース
export const expectedResources = [
  'cloudflare_dns_record',
  'cloudflare_zero_trust_access_application',
  'cloudflare_zero_trust_access_identity_provider',
  'cloudflare_zero_trust_access_policy',
] as const;

// Terraform変数定義フィクスチャ
export const variableFixtures = {
  cloudflareApiToken: { name: 'cloudflare_api_token', sensitive: true },
  cloudflareAccountId: { name: 'cloudflare_account_id' },
  domainName: { name: 'domain_name' },
  subdomainName: { name: 'subdomain_name' },
  targetIpAddress: { name: 'target_ip_address' },
  googleClientId: { name: 'google_client_id', sensitive: true },
  googleClientSecret: { name: 'google_client_secret', sensitive: true },
  allowedEmailDomain: { name: 'allowed_email_domain' },
} as const;

// 機密変数リスト
export const sensitiveVariables = ['cloudflare_api_token', 'google_client_id', 'google_client_secret'] as const;

// 期待されるプロバイダー
export const expectedProviders = ['cloudflare'] as const;
