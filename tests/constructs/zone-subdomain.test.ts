import { App, Testing, TerraformStack } from 'cdktf';
import { CloudflareProvider } from '@cdktf/provider-cloudflare/lib/provider';
import { ZoneSubdomain } from '../../src/constructs/zone-subdomain';
import {
  constructionTestFixtures,
  dnsRecordTestFixtures,
  outputTestFixtures,
  expectedOutputs,
  expectedDnsRecordProps,
} from '../fixtures/zone-subdomain.fixtures';

describe('ZoneSubdomain', () => {
  let app: App;
  let stack: TerraformStack;

  beforeEach(() => {
    app = Testing.app();
    stack = new TerraformStack(app, 'test-stack');

    new CloudflareProvider(stack, 'cloudflare', {
      apiToken: 'test-token',
    });
  });

  describe('基本的な構築テスト', () => {
    // このテストセクションでは軽量な確認のみ実施
    // より詳細なTerraformリソース生成の振る舞いテストは別のdescribeブロックで分離
    interface ConstructCreationTestCase {
      description: string;
      input: (typeof constructionTestFixtures)[keyof typeof constructionTestFixtures];
      expectedFullDomainName: string;
    }

    const testCases: ConstructCreationTestCase[] = [
      {
        description: 'デフォルト設定でサブドメインコンストラクトが作成される',
        input: constructionTestFixtures.basic,
        expectedFullDomainName: 'test.example.com',
      },
      {
        description: 'プロキシ有効設定でサブドメインコンストラクトが作成される',
        input: constructionTestFixtures.withProxy,
        expectedFullDomainName: 'test.example.com',
      },
    ];

    testCases.forEach(({ description, input, expectedFullDomainName }) => {
      it(description, () => {
        const construct = new ZoneSubdomain(stack, 'test-subdomain', input);

        // コンストラクトが正常にインスタンス化されることを確認
        // （内部でTerraformリソースの定義が行われる）
        expect(construct).toBeInstanceOf(ZoneSubdomain);

        // 計算されたドメイン名プロパティが期待値と一致することを確認
        expect(construct.fullDomainName).toBe(expectedFullDomainName);
      });
    });
  });

  describe('DNSレコード生成テスト', () => {
    interface DnsRecordTestCase {
      description: string;
      input: (typeof dnsRecordTestFixtures)[keyof typeof dnsRecordTestFixtures];
      expected: {
        name: string;
        type: string;
        content: string;
        proxied: boolean;
      };
    }

    const testCases: DnsRecordTestCase[] = [
      {
        description: 'プロキシ無効の場合、正しいDNSレコードプロパティが設定される',
        input: dnsRecordTestFixtures.base,
        expected: {
          name: dnsRecordTestFixtures.base.subdomainName,
          type: expectedDnsRecordProps.type,
          content: dnsRecordTestFixtures.base.targetIpAddress,
          proxied: expectedDnsRecordProps.proxiedDefault,
        },
      },
      {
        description: 'プロキシ有効の場合、正しいDNSレコードプロパティが設定される',
        input: dnsRecordTestFixtures.withProxy,
        expected: {
          name: dnsRecordTestFixtures.withProxy.subdomainName,
          type: expectedDnsRecordProps.type,
          content: dnsRecordTestFixtures.withProxy.targetIpAddress,
          proxied: expectedDnsRecordProps.proxiedEnabled,
        },
      },
      {
        description: '異なるIPアドレスでDNSレコードが正しく設定される',
        input: dnsRecordTestFixtures.differentIp,
        expected: {
          name: dnsRecordTestFixtures.differentIp.subdomainName,
          type: expectedDnsRecordProps.type,
          content: dnsRecordTestFixtures.differentIp.targetIpAddress,
          proxied: expectedDnsRecordProps.proxiedDefault,
        },
      },
    ];

    testCases.forEach(({ description, input, expected }) => {
      it(description, () => {
        new ZoneSubdomain(stack, 'test-subdomain', input);

        const synth = Testing.synth(stack);
        const stackConfig = JSON.parse(synth);

        const records = stackConfig.resource?.cloudflare_dns_record;
        expect(records).toBeDefined();

        const recordKeys = Object.keys(records);
        expect(recordKeys.length).toBeGreaterThan(0);

        const firstRecord = records[recordKeys[0]];
        expect(firstRecord.name).toBe(expected.name);
        expect(firstRecord.type).toBe(expected.type);
        expect(firstRecord.content).toBe(expected.content);
        expect(firstRecord.proxied).toBe(expected.proxied);
      });
    });
  });

  describe('出力値生成テスト', () => {
    interface OutputTestCase {
      description: string;
      input: (typeof outputTestFixtures)[keyof typeof outputTestFixtures];
      expectedOutputKeys: string[];
    }

    const testCases: OutputTestCase[] = [
      {
        description: '必要な出力値（サブドメインURL、レコードID）が生成される',
        input: outputTestFixtures.production,
        expectedOutputKeys: [expectedOutputs.subdomain_url, expectedOutputs.record_id],
      },
    ];

    testCases.forEach(({ description, input, expectedOutputKeys }) => {
      it(description, () => {
        new ZoneSubdomain(stack, 'test-subdomain', input);

        const synth = Testing.synth(stack);
        const stackConfig = JSON.parse(synth);

        const outputs = stackConfig.output;
        expect(outputs).toBeDefined();

        const outputKeys = Object.keys(outputs);
        expectedOutputKeys.forEach(expectedKey => {
          expect(outputKeys.some(key => key.includes(expectedKey))).toBe(true);
        });
      });
    });
  });
});
