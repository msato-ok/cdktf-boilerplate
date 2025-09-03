import { App, Testing } from 'cdktf';
import { GoogleStack } from '../src/stacks/google-stack';

describe('GoogleStack', () => {
  let app: App;

  beforeEach(() => {
    app = Testing.app();
  });

  interface GoogleStackTestCase {
    description: string;
    environment: string;
    expectedOutputs: string[];
    expectedVariables: string[];
  }

  const testCases: Array<GoogleStackTestCase> = [
    {
      description: 'should create stack for production environment',
      environment: 'prod',
      expectedOutputs: ['checklist_file_path', 'oauth-checklist-prod.md'],
      expectedVariables: [
        'google_project_id',
        'google_client_id',
        'google_client_secret',
        'support_email',
        'cloudflare_team_domain',
        'domain_name',
        'subdomain_name',
      ],
    },
    {
      description: 'should create stack for development environment',
      environment: 'dev',
      expectedOutputs: ['checklist_file_path', 'oauth-checklist-dev.md'],
      expectedVariables: [
        'google_project_id',
        'google_client_id',
        'google_client_secret',
        'support_email',
        'cloudflare_team_domain',
        'domain_name',
        'subdomain_name',
      ],
    },
  ];

  test.each(testCases)('$description', ({ environment, expectedOutputs, expectedVariables }) => {
    const stack = new GoogleStack(app, 'test-google-stack', { environment });

    const synth = Testing.synth(stack);

    // 期待される出力（Markdownファイル生成）が含まれているかチェック
    expectedOutputs.forEach(content => {
      expect(synth).toContain(content);
    });

    // 期待される変数が含まれているかチェック
    expectedVariables.forEach(variable => {
      expect(synth).toContain(variable);
    });

    // 環境識別子が含まれているか
    expect(synth).toContain(environment);

    // Google OAuth設定ガイダンスが含まれているか
    expect(synth).toContain('google_oauth_setup');
  });

  test('should create stack without throwing errors', () => {
    expect(() => {
      new GoogleStack(app, 'test-stack', { environment: 'test' });
    }).not.toThrow();
  });

  test('should have correct terraform variables', () => {
    const stack = new GoogleStack(app, 'test-stack', { environment: 'test' });
    const synth = Testing.synth(stack);

    // 変数の型とデフォルト値をチェック
    expect(synth).toContain('"type": "string"');
    expect(synth).toContain('"default": "my-google-oauth-project"');
    expect(synth).toContain('"default": "my-team"');
  });

  test('should include OAuth setup instructions', () => {
    const stack = new GoogleStack(app, 'test-stack', { environment: 'test' });
    const synth = Testing.synth(stack);

    // OAuth設定に関する変数が含まれているか
    expect(synth).toContain('google_client_id');
    expect(synth).toContain('google_client_secret');
    expect(synth).toContain('support_email');

    // Markdownチェックリスト生成の出力が含まれているか
    expect(synth).toContain('checklist_file_path');
    expect(synth).toContain('oauth-checklist-test.md');
  });

  test('should handle different environments', () => {
    const environments = ['dev', 'staging', 'prod', 'test'];

    environments.forEach(env => {
      expect(() => {
        const stack = new GoogleStack(app, `stack-${env}`, { environment: env });
        const synth = Testing.synth(stack);
        expect(synth).toContain(env);
        expect(synth).toContain(`oauth-checklist-${env}.md`);
      }).not.toThrow();
    });
  });
});
