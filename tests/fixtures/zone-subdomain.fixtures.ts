/**
 * ZoneSubdomainテスト用のfixtureデータ
 * 各テストケースで使用する共通データの重複定義を排除
 */

// 基本的なサブドメイン設定のベースフィクスチャ
export const baseZoneSubdomainData = {
  domainName: 'example.com',
  subdomainName: 'test',
  targetIpAddress: '192.0.2.1',
  environment: 'test',
} as const;

// 基本構築テスト用フィクスチャ - example.comベース
export const constructionTestFixtures = {
  basic: baseZoneSubdomainData,
  withProxy: { ...baseZoneSubdomainData, proxied: true },
} as const;

// DNSレコード生成テスト用フィクスチャ - dns-test.comベース（APIサブドメイン）
export const dnsRecordTestFixtures = {
  base: {
    domainName: 'dns-test.com',
    subdomainName: 'api',
    targetIpAddress: '203.0.113.10',
    environment: 'test',
  },
  withProxy: {
    domainName: 'dns-test.com',
    subdomainName: 'api',
    targetIpAddress: '203.0.113.10',
    environment: 'test',
    proxied: true,
  },
  differentIp: {
    domainName: 'dns-test.com',
    subdomainName: 'api',
    targetIpAddress: '198.51.100.42',
    environment: 'test',
  },
} as const;

// 出力値生成テスト用フィクスチャ - output-test.orgベース（CDNサブドメイン、本番環境）
export const outputTestFixtures = {
  production: {
    domainName: 'output-test.org',
    subdomainName: 'cdn',
    targetIpAddress: '198.51.100.20',
    environment: 'production',
  },
} as const;

// 期待される出力値
export const expectedOutputs = {
  subdomain_url: 'subdomain_url',
  record_id: 'record_id',
} as const;

// 期待されるDNSレコードプロパティ
export const expectedDnsRecordProps = {
  type: 'A',
  proxiedDefault: false,
  proxiedEnabled: true,
} as const;
