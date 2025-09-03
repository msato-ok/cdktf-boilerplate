import { App, Testing, TerraformStack } from 'cdktf';
import { CloudflareProvider } from '@cdktf/provider-cloudflare/lib/provider';
import { ZeroTrustAccess } from '../../src/constructs/zero-trust-access';
import {
  constructionTestFixtures,
  identityProviderTestFixtures,
  applicationTestFixtures,
  policyTestFixtures,
  outputTestFixtures,
  expectedConfigs,
  expectedOutputKeys,
} from '../fixtures/zero-trust-access.fixtures';

describe('ZeroTrustAccess', () => {
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
    }

    const testCases: ConstructCreationTestCase[] = [
      {
        description: 'デフォルト設定でZeroTrustAccessコンストラクトが作成される',
        input: constructionTestFixtures.basic,
      },
      {
        description: '本番環境設定でZeroTrustAccessコンストラクトが作成される',
        input: constructionTestFixtures.production,
      },
    ];

    testCases.forEach(({ description, input }) => {
      it(description, () => {
        const construct = new ZeroTrustAccess(stack, 'test-access', input);

        expect(construct).toBeInstanceOf(ZeroTrustAccess);
      });
    });
  });

  describe('Google IDプロバイダー生成テスト', () => {
    interface IdentityProviderTestCase {
      description: string;
      input: (typeof identityProviderTestFixtures)[keyof typeof identityProviderTestFixtures];
      expected: {
        type: string;
        accountId: string;
        namePattern: string;
      };
    }

    const testCases: IdentityProviderTestCase[] = [
      {
        description: 'Google認証プロバイダーが正しい設定で作成される',
        input: identityProviderTestFixtures.base,
        expected: {
          type: expectedConfigs.idpType,
          accountId: identityProviderTestFixtures.base.accountId,
          namePattern: `Google IDP for ${identityProviderTestFixtures.base.subdomainName}.${identityProviderTestFixtures.base.domainName}`,
        },
      },
      {
        description: '異なるドメインでGoogle認証プロバイダーが作成される',
        input: identityProviderTestFixtures.differentDomain,
        expected: {
          type: expectedConfigs.idpType,
          accountId: identityProviderTestFixtures.differentDomain.accountId,
          namePattern: `Google IDP for ${identityProviderTestFixtures.differentDomain.subdomainName}.${identityProviderTestFixtures.differentDomain.domainName}`,
        },
      },
    ];

    testCases.forEach(({ description, input, expected }) => {
      it(description, () => {
        new ZeroTrustAccess(stack, 'test-access', input);

        const synth = Testing.synth(stack);
        const stackConfig = JSON.parse(synth);

        const identityProviders = stackConfig.resource?.cloudflare_zero_trust_access_identity_provider;
        expect(identityProviders).toBeDefined();

        const idpKeys = Object.keys(identityProviders);
        expect(idpKeys.length).toBeGreaterThan(0);

        const firstIdp = identityProviders[idpKeys[0]];
        expect(firstIdp.type).toBe(expected.type);
        expect(firstIdp.account_id).toBe(expected.accountId);
        expect(firstIdp.name).toBe(expected.namePattern);
      });
    });
  });

  describe('Accessアプリケーション生成テスト', () => {
    interface ApplicationTestCase {
      description: string;
      input: (typeof applicationTestFixtures)[keyof typeof applicationTestFixtures];
      expected: {
        type: string;
        domain: string;
        sessionDuration: string;
      };
    }

    const testCases: ApplicationTestCase[] = [
      {
        description: 'セルフホスト型Accessアプリケーションが正しいドメインで作成される',
        input: applicationTestFixtures.base,
        expected: {
          type: expectedConfigs.appType,
          domain: `${applicationTestFixtures.base.subdomainName}.${applicationTestFixtures.base.domainName}`,
          sessionDuration: expectedConfigs.sessionDuration,
        },
      },
      {
        description: 'サブドメインが異なるAccessアプリケーションが作成される',
        input: applicationTestFixtures.differentSubdomain,
        expected: {
          type: expectedConfigs.appType,
          domain: `${applicationTestFixtures.differentSubdomain.subdomainName}.${applicationTestFixtures.differentSubdomain.domainName}`,
          sessionDuration: expectedConfigs.sessionDuration,
        },
      },
    ];

    testCases.forEach(({ description, input, expected }) => {
      it(description, () => {
        new ZeroTrustAccess(stack, 'test-access', input);

        const synth = Testing.synth(stack);
        const stackConfig = JSON.parse(synth);

        const applications = stackConfig.resource?.cloudflare_zero_trust_access_application;
        expect(applications).toBeDefined();

        const appKeys = Object.keys(applications);
        expect(appKeys.length).toBeGreaterThan(0);

        const firstApp = applications[appKeys[0]];
        expect(firstApp.domain).toBe(expected.domain);
        expect(firstApp.type).toBe(expected.type);
        expect(firstApp.session_duration).toBe(expected.sessionDuration);
      });
    });
  });

  describe('Accessポリシー生成テスト', () => {
    interface PolicyTestCase {
      description: string;
      input: (typeof policyTestFixtures)[keyof typeof policyTestFixtures];
      expected: {
        decision: string;
        namePattern: string;
      };
    }

    const testCases: PolicyTestCase[] = [
      {
        description: 'メールドメイン許可ポリシーが正しく作成される',
        input: policyTestFixtures.base,
        expected: {
          decision: expectedConfigs.policyDecision,
          namePattern: `Allow ${policyTestFixtures.base.allowedEmailDomain} domain`,
        },
      },
      {
        description: '異なるメールドメイン許可ポリシーが作成される',
        input: policyTestFixtures.differentEmailDomain,
        expected: {
          decision: expectedConfigs.policyDecision,
          namePattern: `Allow ${policyTestFixtures.differentEmailDomain.allowedEmailDomain} domain`,
        },
      },
    ];

    testCases.forEach(({ description, input, expected }) => {
      it(description, () => {
        new ZeroTrustAccess(stack, 'test-access', input);

        const synth = Testing.synth(stack);
        const stackConfig = JSON.parse(synth);

        const policies = stackConfig.resource?.cloudflare_zero_trust_access_policy;
        expect(policies).toBeDefined();

        const policyKeys = Object.keys(policies);
        expect(policyKeys.length).toBeGreaterThan(0);

        const firstPolicy = policies[policyKeys[0]];
        expect(firstPolicy.decision).toBe(expected.decision);
        expect(firstPolicy.name).toBe(expected.namePattern);
      });
    });
  });

  describe('出力値生成テスト', () => {
    interface OutputTestCase {
      description: string;
      input: (typeof outputTestFixtures)[keyof typeof outputTestFixtures];
      expectedOutputKeys: readonly string[];
    }

    const testCases: OutputTestCase[] = [
      {
        description: '必要な出力値（アプリID、ドメイン、ポリシーID、IDプロバイダーID、CloudflareIP情報）が生成される',
        input: outputTestFixtures.production,
        expectedOutputKeys,
      },
    ];

    testCases.forEach(({ description, input, expectedOutputKeys }) => {
      it(description, () => {
        new ZeroTrustAccess(stack, 'test-access', input);

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
