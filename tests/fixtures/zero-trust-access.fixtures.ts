/**
 * ZeroTrustAccessテスト用のfixtureデータ
 * 各テストケースで使用する共通データの重複定義を排除
 */

// ベースアカウント設定のフィクスチャ
const baseAccountData = {
  googleClientId: 'test-client-id',
  googleClientSecret: 'test-client-secret',
  environment: 'test',
} as const;

// 基本構築テスト用フィクスチャ - construct-test.comベース（認証サブドメイン）
export const constructionTestFixtures = {
  basic: {
    accountId: 'basic-test-account',
    domainName: 'construct-test.com',
    subdomainName: 'auth',
    ...baseAccountData,
    allowedEmailDomain: 'construct-test.com',
  },
  production: {
    accountId: 'basic-test-account',
    domainName: 'construct-test.com',
    subdomainName: 'auth',
    ...baseAccountData,
    allowedEmailDomain: 'construct-test.com',
    environment: 'production',
  },
} as const;

// IDプロバイダーテスト用フィクスチャ - identity-test.netベース（ログインサブドメイン）
export const identityProviderTestFixtures = {
  base: {
    accountId: 'idp-test-account',
    domainName: 'identity-test.net',
    subdomainName: 'login',
    ...baseAccountData,
    allowedEmailDomain: 'identity-test.net',
  },
  differentDomain: {
    accountId: 'idp-test-account',
    domainName: 'different-domain.org',
    subdomainName: 'sso',
    ...baseAccountData,
    allowedEmailDomain: 'identity-test.net',
  },
} as const;

// アプリケーションテスト用フィクスチャ - application-test.ioベース（セキュアサブドメイン）
export const applicationTestFixtures = {
  base: {
    accountId: 'app-test-account',
    domainName: 'application-test.io',
    subdomainName: 'secure',
    ...baseAccountData,
    allowedEmailDomain: 'application-test.io',
  },
  differentSubdomain: {
    accountId: 'app-test-account',
    domainName: 'application-test.io',
    subdomainName: 'dashboard',
    ...baseAccountData,
    allowedEmailDomain: 'application-test.io',
  },
} as const;

// ポリシーテスト用フィクスチャ - policy-test.devベース（保護されたサブドメイン）
export const policyTestFixtures = {
  base: {
    accountId: 'policy-test-account',
    domainName: 'policy-test.dev',
    subdomainName: 'protected',
    ...baseAccountData,
    allowedEmailDomain: 'policy-test.dev',
  },
  differentEmailDomain: {
    accountId: 'policy-test-account',
    domainName: 'policy-test.dev',
    subdomainName: 'protected',
    ...baseAccountData,
    allowedEmailDomain: 'enterprise.biz',
  },
} as const;

// 出力値テスト用フィクスチャ - output-test.coベース（APIサブドメイン、本番環境）
export const outputTestFixtures = {
  production: {
    accountId: 'output-test-account',
    domainName: 'output-test.co',
    subdomainName: 'api',
    ...baseAccountData,
    allowedEmailDomain: 'output-test.co',
    environment: 'production',
  },
} as const;

// 期待される設定値
export const expectedConfigs = {
  idpType: 'google',
  appType: 'self_hosted',
  sessionDuration: '24h',
  policyDecision: 'allow',
} as const;

// 期待される出力値キー
export const expectedOutputKeys = [
  'application_id',
  'application_domain',
  'policy_id',
  'identity_provider_id',
  'cloudflare_ip_ranges_info',
] as const;
