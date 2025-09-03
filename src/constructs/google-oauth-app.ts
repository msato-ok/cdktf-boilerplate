import { TerraformOutput } from 'cdktf';
import { Construct } from 'constructs';
import { loadServiceAccount } from '../shared/google-rest';
import {
  checkOAuthClientCredentials,
  checkServiceAccountPermissions,
  lookupProjectNumber,
} from '../shared/google-checks';
import { generateAndWriteOAuthChecklist, GoogleOAuthChecklistData } from '../shared/markdown-output';

export interface GoogleOAuthSetupProps {
  /**
   * Google Cloud Project ID
   * 例: "my-project-123"
   */
  projectId: string;

  /**
   * Google Cloud Project Number（任意）。Client ID の先頭に含まれる数値と一致するか検証に使用
   */
  projectNumber?: string;

  /**
   * Google OAuth Client ID（検証に使用）
   */
  googleClientId?: string;

  /**
   * Google OAuth Client Secret（検証に使用）
   */
  googleClientSecret?: string;

  /**
   * OAuth アプリケーション名
   * 例: "Cloudflare Access Integration"
   */
  displayName: string;

  /**
   * Cloudflare Zero Trust チームドメイン（リダイレクトURIで使用）
   * 例: "my-company" → https://my-company.cloudflareaccess.com/cdn-cgi/access/callback
   */
  cloudflareTeamName: string;

  /**
   * 環境識別子（dev/prod等）
   */
  environment: string;

  /**
   * ドメイン名（フルドメインの構築に使用）
   */
  domainName: string;

  /**
   * サブドメイン名
   */
  subdomainName: string;

  /**
   * サポートメールアドレス（OAuth同意画面用）
   */
  supportEmail: string;
}

export interface OAuthValidationResult {
  clientIdValid: boolean;
  clientSecretValid: boolean;
  projectNumberMatches: boolean;
  validationErrors: string[];
  validationWarnings: string[];
  validationSkipped?: boolean;
  serviceAccountEmail?: string;
  extractedProjectNumber?: string;
  resolvedProjectNumberStatus?: string;
  resolvedProjectNumberDetail?: string;
  resolvedProjectNumber?: string;
  oauthClientAuth?: {
    status: 'accepted' | 'invalid' | 'skipped' | 'error';
    detail?: string;
  };
  serviceAccountPermissions?: {
    status: string;
    detail?: string;
    missing?: string[];
    granted?: string[];
    required?: string[];
  };
}

/**
 * Google OAuth アプリケーション設定のヘルパーとガイダンス提供クラス
 *
 * 設計思想: OAuth同意画面設定の自動化は以下の理由により意図的に避けています
 * - 組織のブランディング要件（ロゴ、アプリ名、ポリシーURL等）
 * - セキュリティレビュー・承認プロセスの尊重
 * - Google審査プロセス（外部公開時）への対応
 * - 設定ミス・デバッグの複雑化回避
 *
 * このクラスは必要な設定手順と値を提供し、適切な手動設定を支援します。
 */
export class GoogleOAuthSetup extends Construct {
  // 検証結果を格納するプロパティ
  public readonly validationResults: Record<string, unknown> = {};

  constructor(scope: Construct, id: string, props: GoogleOAuthSetupProps) {
    super(scope, id);

    // 同期的な検証を実行（限定機能）
    const validationResults = this.performSyncOAuthValidation(props);

    // Markdownチェックリストファイルを生成
    this.generateMarkdownChecklist(props, validationResults);

    // 設定検証とガイダンスは Markdown のみに出力（コンソールはパスのみ）
    this.generateConfigurationGuidance(props);
  }

  /**
   * OAuth設定の検証を実行（同期処理 - 基本的な形式チェックのみ）
   */
  private performSyncOAuthValidation(props: GoogleOAuthSetupProps): OAuthValidationResult {
    // サービスアカウント情報取得
    const sa = loadServiceAccount();
    const saEmail = sa?.client_email || '(不明)';

    if (!props.googleClientId && !props.googleClientSecret) {
      const skipResult: OAuthValidationResult = {
        validationSkipped: true,
        validationErrors: ['Client ID/Secret が設定されていません'],
        validationWarnings: [],
        serviceAccountEmail: saEmail,
        clientIdValid: false,
        clientSecretValid: false,
        projectNumberMatches: false,
      };

      new TerraformOutput(this, 'oauth_validation_skipped', {
        value: '⚠️ Client ID/Secret が設定されていないため、設定検証をスキップしました。',
        description: 'OAuth設定検証の状態',
      });
      return skipResult;
    }

    // 同期的な検証のみ実行
    const validationResult = this.validateOAuthSettingsSync(
      props.googleClientId,
      props.googleClientSecret,
      props.projectId,
      props.projectNumber,
    );

    // サービスアカウント情報を結果に含める
    validationResult.serviceAccountEmail = saEmail;

    // extractedProjectNumber を設定
    validationResult.extractedProjectNumber = props.googleClientId
      ? String(props.googleClientId).split('-')[0]
      : undefined;

    // サービスアカウントがあれば詳細検証をバックグラウンドで実行
    if (sa) {
      this.performAsyncValidationInBackground(props, validationResult);
    }

    // コンソールを静かに保つため、詳細は Markdown のみ。
    return validationResult;
  }

  /**
   * バックグラウンドで非同期検証を実行
   */
  private performAsyncValidationInBackground(props: GoogleOAuthSetupProps, baseResult: OAuthValidationResult): void {
    // バックグラウンドで非同期処理を実行（結果はMarkdownファイルに追記）
    this.performAsyncOAuthValidation(props)
      .then(asyncResult => {
        // 結果をbaseResultにマージ
        Object.assign(baseResult, asyncResult);
        // Markdownファイルを再生成
        this.generateMarkdownChecklist(props, baseResult);
      })
      .catch(() => {
        // エラーは無視（基本検証結果は既に利用可能）
      });
  }

  /**
   * OAuth設定の検証を実行（非同期処理）
   */
  private async performAsyncOAuthValidation(props: GoogleOAuthSetupProps): Promise<OAuthValidationResult> {
    // サービスアカウント情報取得
    const sa = loadServiceAccount();
    const saEmail = sa?.client_email || '(不明)';

    if (!props.googleClientId && !props.googleClientSecret) {
      const skipResult: OAuthValidationResult = {
        validationSkipped: true,
        validationErrors: ['Client ID/Secret が設定されていません'],
        validationWarnings: [],
        serviceAccountEmail: saEmail,
        clientIdValid: false,
        clientSecretValid: false,
        projectNumberMatches: false,
      };

      new TerraformOutput(this, 'oauth_validation_skipped', {
        value: '⚠️ Client ID/Secret が設定されていないため、設定検証をスキップしました。',
        description: 'OAuth設定検証の状態',
      });
      return skipResult;
    }

    // サービスアカウントなしの場合
    if (!sa) {
      const errorResult: OAuthValidationResult = {
        validationSkipped: false,
        validationErrors: ['サービスアカウントが設定されていません'],
        validationWarnings: [],
        resolvedProjectNumberStatus: 'auth_error',
        resolvedProjectNumberDetail: 'no_service_account',
        serviceAccountEmail: saEmail,
        clientIdValid: false,
        clientSecretValid: false,
        projectNumberMatches: false,
      };

      new TerraformOutput(this, 'service_account_error', {
        value: '❌ サービスアカウントの問題により自動検証を中断しました。詳細はMarkdownファイルを参照してください。',
        description: 'サービスアカウントの設定/権限を修正してください',
      });
      return errorResult;
    }

    try {
      // 非同期的な検証を実行
      const validationResult = await this.validateOAuthSettingsAsync(
        props.googleClientId,
        props.googleClientSecret,
        props.projectId,
        props.projectNumber,
      );

      // サービスアカウント情報を結果に含める
      validationResult.serviceAccountEmail = saEmail;

      // extractedProjectNumber を設定
      validationResult.extractedProjectNumber = props.googleClientId
        ? String(props.googleClientId).split('-')[0]
        : undefined;

      // コンソールを静かに保つため、詳細は Markdown のみ。
      return validationResult;
    } catch (error) {
      const errorResult: OAuthValidationResult = {
        validationSkipped: false,
        validationErrors: [`OAuth設定検証中にエラーが発生: ${error}`],
        validationWarnings: [],
        serviceAccountEmail: saEmail,
        clientIdValid: false,
        clientSecretValid: false,
        projectNumberMatches: false,
      };

      new TerraformOutput(this, 'oauth_validation_error', {
        value: `❌ OAuth設定検証中にエラーが発生しました: ${error}`,
        description: 'OAuth設定検証エラー',
      });
      return errorResult;
    }
  }

  /**
   * 同期的なOAuth設定検証（基本的な形式チェックのみ）
   */
  private validateOAuthSettingsSync(
    clientId?: string,
    clientSecret?: string,
    _projectId?: string,
    projectNumber?: string,
  ): OAuthValidationResult {
    const result: OAuthValidationResult = {
      clientIdValid: false,
      clientSecretValid: false,
      projectNumberMatches: false,
      validationErrors: [],
      validationWarnings: [],
    };

    if (!clientId) {
      result.validationErrors.push('❌ Client ID が設定されていません');
      return result;
    }

    // Client IDの形式チェック
    const clientIdPattern = /^[0-9]+-[a-zA-Z0-9]+\.apps\.googleusercontent\.com$/;
    if (!clientIdPattern.test(clientId)) {
      result.validationErrors.push('❌ Client ID の形式が正しくありません');
      return result;
    }

    result.clientIdValid = true;

    // Project Number が Client ID 先頭の数値と一致するかチェック
    // Client ID フォーマット: "<project-number>-<random>.apps.googleusercontent.com"
    const extractedProjectNumber = clientId.split('-')[0];
    if (projectNumber) {
      if (extractedProjectNumber !== projectNumber) {
        result.validationWarnings.push(
          `⚠️ Project Number (${projectNumber}) と Client ID の先頭数値 (${extractedProjectNumber}) が一致しません`,
        );
      } else {
        result.projectNumberMatches = true;
      }
    }

    // Client Secretの形式チェック
    if (clientSecret) {
      const clientSecretPattern = /^GOCSPX-[a-zA-Z0-9_-]+$/;
      if (!clientSecretPattern.test(clientSecret)) {
        result.validationErrors.push('❌ Client Secret の形式が正しくありません');
      } else {
        result.clientSecretValid = true;
      }
    }

    return result;
  }

  /**
   * 非同期的なOAuth設定検証（API呼び出し含む）
   */
  private async validateOAuthSettingsAsync(
    clientId?: string,
    clientSecret?: string,
    projectId?: string,
    projectNumber?: string,
  ): Promise<OAuthValidationResult> {
    // 同期的な基本検証から開始
    const result = this.validateOAuthSettingsSync(clientId, clientSecret, projectId, projectNumber);

    // OAuth クライアント認証の簡易チェック
    if (clientId && clientSecret) {
      try {
        const authCheck = await checkOAuthClientCredentials(clientId, clientSecret);
        result.oauthClientAuth = authCheck;
      } catch {
        result.oauthClientAuth = { status: 'error', detail: 'network_or_api_error' };
      }
    }

    // Project Number の解決
    if (projectId) {
      try {
        const projectLookup = await lookupProjectNumber(projectId);
        result.resolvedProjectNumberStatus = projectLookup.status;
        result.resolvedProjectNumberDetail = projectLookup.detail;
        result.resolvedProjectNumber = projectLookup.projectNumber;

        // Project Number の整合性チェック
        if (projectLookup.status === 'ok' && projectLookup.projectNumber && clientId) {
          const extractedProjectNumber = clientId.split('-')[0];
          result.projectNumberMatches = extractedProjectNumber === projectLookup.projectNumber;
        }
      } catch {
        result.resolvedProjectNumberStatus = 'error';
        result.resolvedProjectNumberDetail = 'api_error';
      }
    }

    // サービスアカウント権限の検証
    if (projectId) {
      try {
        const permCheck = await checkServiceAccountPermissions(projectId);
        result.serviceAccountPermissions = permCheck;
      } catch {
        result.serviceAccountPermissions = { status: 'error', detail: 'api_error' };
      }
    }

    return result;
  }

  /**
   * Markdownチェックリストファイルを生成
   */
  private generateMarkdownChecklist(props: GoogleOAuthSetupProps, validationResults: OAuthValidationResult): string {
    const redirectUri = `https://${props.cloudflareTeamName}.cloudflareaccess.com/cdn-cgi/access/callback`;

    const checklistData: GoogleOAuthChecklistData = {
      projectId: props.projectId,
      environment: props.environment,
      displayName: props.displayName,
      supportEmail: props.supportEmail,
      cloudflareTeamDomain: props.cloudflareTeamName,
      redirectUri,
      domainName: props.domainName,
      subdomainName: props.subdomainName,
      validationResults,
    };

    try {
      const outputPath = `./oauth-checklist-${props.environment}.md`;
      const filePath = generateAndWriteOAuthChecklist(checklistData, outputPath);

      new TerraformOutput(this, 'checklist_file_path', {
        value: `${filePath}\nGoogle OAuth設定チェックリストを生成しました`,
        description: 'Markdownチェックリストファイルのパス',
      });
      return filePath;
    } catch (error) {
      new TerraformOutput(this, 'checklist_generation_error', {
        value: `❌ チェックリストファイル生成エラー: ${error}`,
        description: 'Markdownチェックリスト生成エラー',
      });
      return `./oauth-checklist-${props.environment}.md`;
    }
  }

  /**
   * OAuth設定のガイダンスを生成
   */
  private generateConfigurationGuidance(props: GoogleOAuthSetupProps): void {
    // 設定検証結果をvalidationResultsに格納
    this.validationResults.projectId = props.projectId;
    this.validationResults.supportEmail = props.supportEmail;
    this.validationResults.displayName = props.displayName;
    this.validationResults.environment = props.environment;

    // 検証項目のチェックリスト
    this.validationResults.requiredChecks = {
      iapApiEnabled: '手動確認が必要',
      oauthBrandExists: '手動確認が必要',
      oauthClientExists: '手動確認が必要',
      serviceAccountExists: '手動確認が必要',
    };
  }
}
