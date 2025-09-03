import { App, Testing } from 'cdktf';
import { CloudflareStack } from '../src/stacks/cloudflare-stack';
import {
  environmentFixtures,
  expectedResources,
  variableFixtures,
  sensitiveVariables,
  expectedProviders,
} from './fixtures/cloudflare-stack.fixtures';

describe('CloudflareStack', () => {
  let app: App;

  beforeEach(() => {
    app = Testing.app();
  });

  describe('スタック基本構築テスト', () => {
    // このテストセクションでは軽量な確認のみ実施
    // より詳細なTerraformリソース生成の振る舞いテストは別のdescribeブロックで分離
    interface StackCreationTestCase {
      description: string;
      environment: (typeof environmentFixtures)[keyof typeof environmentFixtures];
    }

    const testCases: StackCreationTestCase[] = [
      {
        description: 'テスト環境でCloudflareStackが正常に作成される',
        environment: environmentFixtures.test,
      },
      {
        description: '本番環境でCloudflareStackが正常に作成される',
        environment: environmentFixtures.production,
      },
      {
        description: 'ステージング環境でCloudflareStackが正常に作成される',
        environment: environmentFixtures.staging,
      },
    ];

    testCases.forEach(({ description, environment }) => {
      it(description, () => {
        const stack = new CloudflareStack(app, 'test-cloudflare', {
          environment,
        });

        expect(stack).toBeInstanceOf(CloudflareStack);
      });
    });
  });

  describe('Terraformリソース生成テスト', () => {
    interface ResourceSynthesisTestCase {
      description: string;
      environment: (typeof environmentFixtures)[keyof typeof environmentFixtures];
      expectedResources: readonly string[];
    }

    const testCases: ResourceSynthesisTestCase[] = [
      {
        description: '必要なCloudflareリソース（DNS、Access、プロバイダー）が正しく生成される',
        environment: environmentFixtures.resourceTest,
        expectedResources,
      },
    ];

    testCases.forEach(({ description, environment, expectedResources }) => {
      it(description, () => {
        const stack = new CloudflareStack(app, 'test-cloudflare', {
          environment,
        });

        const synth = Testing.synth(stack);
        const stackConfig = JSON.parse(synth);

        expect(stackConfig).toBeDefined();
        expect(stackConfig.resource).toBeDefined();

        const resourceKeys = Object.keys(stackConfig.resource);
        expectedResources.forEach(expectedResource => {
          expect(resourceKeys).toContain(expectedResource);
        });
      });
    });
  });

  describe('Terraform変数定義テスト', () => {
    interface VariableDefinitionTestCase {
      description: string;
      environment: (typeof environmentFixtures)[keyof typeof environmentFixtures];
      expectedVariables: typeof variableFixtures;
    }

    const testCases: VariableDefinitionTestCase[] = [
      {
        description: '必要なTerraform変数（機密情報を含む）が正しく定義される',
        environment: environmentFixtures.variableTest,
        expectedVariables: variableFixtures,
      },
    ];

    testCases.forEach(({ description, environment, expectedVariables }) => {
      it(description, () => {
        const stack = new CloudflareStack(app, 'test-cloudflare', {
          environment,
        });

        const synth = Testing.synth(stack);
        const stackConfig = JSON.parse(synth);

        const variables = stackConfig.variable;
        expect(variables).toBeDefined();

        Object.values(expectedVariables).forEach(variable => {
          expect(variables[variable.name]).toBeDefined();

          if ('sensitive' in variable && variable.sensitive !== undefined) {
            expect(variables[variable.name].sensitive).toBe(variable.sensitive);
          }

          if ('defaultValue' in variable && variable.defaultValue !== undefined) {
            expect(variables[variable.name].default).toBe(variable.defaultValue);
          }
        });
      });
    });
  });

  describe('機密変数セキュリティテスト', () => {
    interface SensitiveVariableTestCase {
      description: string;
      environment: (typeof environmentFixtures)[keyof typeof environmentFixtures];
      sensitiveVariables: readonly string[];
    }

    const testCases: SensitiveVariableTestCase[] = [
      {
        description: '機密情報を含む変数（API Token、OAuth認証情報）が適切にマークされる',
        environment: environmentFixtures.securityTest,
        sensitiveVariables,
      },
    ];

    testCases.forEach(({ description, environment, sensitiveVariables }) => {
      it(description, () => {
        const stack = new CloudflareStack(app, 'test-cloudflare', {
          environment,
        });

        const synth = Testing.synth(stack);
        const stackConfig = JSON.parse(synth);

        const variables = stackConfig.variable;

        sensitiveVariables.forEach(variableName => {
          expect(variables[variableName].sensitive).toBe(true);
        });
      });
    });
  });

  describe('プロバイダー設定テスト', () => {
    interface ProviderConfigTestCase {
      description: string;
      environment: (typeof environmentFixtures)[keyof typeof environmentFixtures];
      expectedProviders: readonly string[];
    }

    const testCases: ProviderConfigTestCase[] = [
      {
        description: 'Cloudflareプロバイダーが正しく設定される',
        environment: environmentFixtures.providerTest,
        expectedProviders,
      },
    ];

    testCases.forEach(({ description, environment, expectedProviders }) => {
      it(description, () => {
        const stack = new CloudflareStack(app, 'test-cloudflare', {
          environment,
        });

        const synth = Testing.synth(stack);
        const stackConfig = JSON.parse(synth);

        expect(stackConfig.provider).toBeDefined();

        expectedProviders.forEach(providerName => {
          expect(stackConfig.provider[providerName]).toBeDefined();
        });
      });
    });
  });
});
