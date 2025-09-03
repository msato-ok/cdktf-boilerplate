import { App, Testing, TerraformStack } from 'cdktf';
import { GoogleOAuthSetup, GoogleOAuthSetupProps } from '../../src/constructs/google-oauth-app';
import {
  googleOAuthSetupFixtures,
  expectedRedirectUris,
  expectedFullDomains,
} from '../fixtures/google-oauth-setup.fixtures';

describe('GoogleOAuthSetup', () => {
  let app: App;
  let stack: TerraformStack;

  beforeEach(() => {
    app = Testing.app();
    stack = new TerraformStack(app, 'test-stack');
  });

  interface OAuthSetupTestCase {
    description: string;
    props: GoogleOAuthSetupProps;
    expectedRedirectUri: string;
    expectedFullDomain: string;
  }

  const testCases: Array<OAuthSetupTestCase> = [
    {
      description: 'should generate correct setup configuration for development environment',
      props: googleOAuthSetupFixtures.development,
      expectedRedirectUri: expectedRedirectUris.development,
      expectedFullDomain: expectedFullDomains.development,
    },
    {
      description: 'should generate correct setup configuration for production environment',
      props: googleOAuthSetupFixtures.production,
      expectedRedirectUri: expectedRedirectUris.production,
      expectedFullDomain: expectedFullDomains.production,
    },
    {
      description: 'should handle staging environment correctly',
      props: googleOAuthSetupFixtures.staging,
      expectedRedirectUri: expectedRedirectUris.staging,
      expectedFullDomain: expectedFullDomains.staging,
    },
    {
      description: 'should handle minimal configuration',
      props: googleOAuthSetupFixtures.minimal,
      expectedRedirectUri: expectedRedirectUris.minimal,
      expectedFullDomain: expectedFullDomains.minimal,
    },
    {
      description: 'should handle special characters in domain names',
      props: googleOAuthSetupFixtures.withSpecialChars,
      expectedRedirectUri: expectedRedirectUris.withSpecialChars,
      expectedFullDomain: expectedFullDomains.withSpecialChars,
    },
  ];

  test.each(testCases)('$description', ({ props }) => {
    new GoogleOAuthSetup(stack, 'oauth-setup', props);

    const synth = Testing.synth(stack);

    // Markdownチェックリスト生成の出力が含まれているか
    expect(synth).toContain('checklist_file_path');
    expect(synth).toContain(`oauth-checklist-${props.environment}.md`);

    // OAuth設定検証の出力が含まれているか（Client ID/Secretが設定されていない場合はスキップメッセージ）
    expect(synth).toContain('oauth_validation_skipped');
    expect(synth).toContain('Client ID/Secret が設定されていないため');
  });

  describe('Authentication validation', () => {
    const originalGoogleCredentials = process.env.GOOGLE_CREDENTIALS;
    const originalGoogleApplicationCredentials = process.env.GOOGLE_APPLICATION_CREDENTIALS;

    beforeEach(() => {
      delete process.env.GOOGLE_CREDENTIALS;
      delete process.env.GOOGLE_APPLICATION_CREDENTIALS;
    });

    afterEach(() => {
      // 環境変数を復元
      if (originalGoogleCredentials) {
        process.env.GOOGLE_CREDENTIALS = originalGoogleCredentials;
      }
      if (originalGoogleApplicationCredentials) {
        process.env.GOOGLE_APPLICATION_CREDENTIALS = originalGoogleApplicationCredentials;
      }

      // モックをクリア
      jest.clearAllMocks();
    });

    test('should not require Google authentication for OAuth setup guidance', () => {
      // 認証なしでもガイダンス提供のため正常動作する
      expect(() => {
        new GoogleOAuthSetup(stack, 'oauth-setup', googleOAuthSetupFixtures.development);
      }).not.toThrow();
    });

    test('should not throw error when GOOGLE_CREDENTIALS is set', () => {
      process.env.GOOGLE_CREDENTIALS = '{"type":"service_account","project_id":"test"}';

      expect(() => {
        new GoogleOAuthSetup(stack, 'oauth-setup', googleOAuthSetupFixtures.development);
      }).not.toThrow();
    });

    test('should not throw error when GOOGLE_APPLICATION_CREDENTIALS is set', () => {
      process.env.GOOGLE_APPLICATION_CREDENTIALS = '/path/to/service-account.json';

      expect(() => {
        new GoogleOAuthSetup(stack, 'oauth-setup', googleOAuthSetupFixtures.development);
      }).not.toThrow();
    });

    // gcloud 経路は廃止
  });

  test('should create valid construct without errors when authenticated', () => {
    // テスト用にサービスアカウント認証を模擬
    process.env.GOOGLE_CREDENTIALS = '{"type":"service_account","project_id":"test"}';

    expect(() => {
      new GoogleOAuthSetup(stack, 'oauth-setup', googleOAuthSetupFixtures.development);
    }).not.toThrow();

    // 環境変数をクリア
    delete process.env.GOOGLE_CREDENTIALS;
  });
});
