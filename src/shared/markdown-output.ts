import * as fs from 'fs';
import * as path from 'path';

/**
 * Terraform トークンをユーザーフレンドリーな形式に変換
 */
function sanitizeTfToken(value: string): string {
  if (typeof value === 'string' && value.includes('${TfToken[')) {
    return '[tfvars からの値]';
  }
  return value;
}

export interface MarkdownSection {
  title: string;
  content: string;
  level: number; // 1-6 for heading levels
}

export interface GoogleOAuthChecklistData {
  projectId: string;
  environment: string;
  displayName: string;
  supportEmail: string;
  cloudflareTeamDomain: string;
  redirectUri: string;
  domainName: string;
  subdomainName: string;
  validationResults?: any;
}

// 検証結果の型とサニタイズ
type OAuthClientAuthStatus = 'accepted' | 'invalid' | 'skipped' | 'error';
interface ServiceAccountPermsRes {
  status: string;
  detail?: string;
  missing?: string[];
  granted?: string[];
  checked?: string[];
}
interface ValidationResults {
  clientIdValid?: boolean;
  clientSecretValid?: boolean;
  projectNumberMatches?: boolean;
  validationErrors?: string[];
  validationWarnings?: string[];
  serviceAccountEmail?: string;
  extractedProjectNumber?: string;
  resolvedProjectNumber?: string;
  resolvedProjectNumberStatus?: string;
  resolvedProjectNumberDetail?: string;
  oauthClientAuth?: { status: OAuthClientAuthStatus; detail?: string };
  serviceAccountPermissions?: ServiceAccountPermsRes;
}

function toStringArray(v: unknown): string[] {
  return Array.isArray(v) ? v.filter((x): x is string => typeof x === 'string') : [];
}

function sanitizeValidationResults(input: unknown): ValidationResults {
  const src = (typeof input === 'object' && input !== null ? input : {}) as Record<string, unknown>;
  const out: ValidationResults = {};
  out.clientIdValid = Boolean(src.clientIdValid);
  out.clientSecretValid = Boolean(src.clientSecretValid);
  out.projectNumberMatches = Boolean(src.projectNumberMatches);
  out.validationErrors = toStringArray(src.validationErrors);
  out.validationWarnings = toStringArray(src.validationWarnings);
  out.serviceAccountEmail = typeof src.serviceAccountEmail === 'string' ? src.serviceAccountEmail : undefined;
  out.extractedProjectNumber = typeof src.extractedProjectNumber === 'string' ? src.extractedProjectNumber : undefined;
  out.resolvedProjectNumber = typeof src.resolvedProjectNumber === 'string' ? src.resolvedProjectNumber : undefined;
  out.resolvedProjectNumberStatus =
    typeof src.resolvedProjectNumberStatus === 'string' ? src.resolvedProjectNumberStatus : undefined;
  out.resolvedProjectNumberDetail =
    typeof src.resolvedProjectNumberDetail === 'string' ? src.resolvedProjectNumberDetail : undefined;
  if (src.oauthClientAuth && typeof src.oauthClientAuth === 'object') {
    const a = src.oauthClientAuth as Record<string, unknown>;
    const status = a.status;
    if (status === 'accepted' || status === 'invalid' || status === 'skipped' || status === 'error') {
      out.oauthClientAuth = { status, detail: typeof a.detail === 'string' ? a.detail : undefined } as {
        status: OAuthClientAuthStatus;
        detail?: string;
      };
    }
  }
  if (src.serviceAccountPermissions && typeof src.serviceAccountPermissions === 'object') {
    const p = src.serviceAccountPermissions as Record<string, unknown>;
    out.serviceAccountPermissions = {
      status: typeof p.status === 'string' ? p.status : 'error',
      detail: typeof p.detail === 'string' ? p.detail : undefined,
      missing: toStringArray(p.missing),
      granted: toStringArray(p.granted),
      checked: toStringArray(p.checked),
    };
  }
  return out;
}

/**
 * Google OAuth設定チェックリストをMarkdownファイルとして出力
 */
export function generateOAuthChecklistMarkdown(data: GoogleOAuthChecklistData): string {
  const sections: MarkdownSection[] = [];

  // Header
  sections.push({
    title: `Google OAuth 設定チェックリスト - ${data.environment}環境`,
    level: 1,
    content: `
- **プロジェクト**: ${sanitizeTfToken(data.projectId)}
- **環境**: ${data.environment}
- **生成日時**: ${new Date().toLocaleString('ja-JP')}
`,
  });

  // 検証結果セクション
  if (data.validationResults) {
    sections.push({
      title: '🔍 自動検証結果',
      level: 2,
      content: generateValidationResultsMarkdown(sanitizeValidationResults(data.validationResults)),
    });
  }

  // 手動確認セクション（ガイダンスの前口上）
  sections.push({
    title: '🧭 手動確認事項',
    level: 2,
    content: `
以下の項目は Google Cloud Console の画面での手動確認が必要です。

- 設定の内容・有効化状態・入力ミスなどは UI 上で確認・修正してください
- 本ファイルはチェックリストとしてご利用ください（必要に応じて Markdown で進捗チェック）
`,
  });

  // API有効化確認
  sections.push({
    title: '📋 必須API有効化確認',
    level: 2,
    content: `
以下のAPIがGoogle Cloud Consoleで有効化されていることを確認してください。

**確認URL**: [APIs & Services > Library](https://console.cloud.google.com/apis/library?project=${sanitizeTfToken(
      data.projectId,
    )})

- [ ] **Cloud Resource Manager API** (cloudresourcemanager.googleapis.com)

> 💡 **補足**
> - OAuth 2.0 のトークンエンドポイント（oauth2.googleapis.com）は個別のAPI有効化は不要です
> - サービスアカウントや権限運用を行う場合は、次のAPIがあると便利です（必要に応じて）:
>   - **Identity and Access Management (IAM) API** (iam.googleapis.com)
>   - **IAM Service Account Credentials API** (iamcredentials.googleapis.com)
`,
  });

  // OAuth同意画面設定
  sections.push({
    title: '🔐 OAuth同意画面設定確認',
    level: 2,
    content: `
**確認URL**: [OAuth同意画面](https://console.cloud.google.com/apis/credentials/consent?project=${sanitizeTfToken(
      data.projectId,
    )})

### 基本設定

ブランディングのメニュー選択

- [ ] **アプリケーション名**: \`${sanitizeTfToken(data.displayName)}\`
- [ ] **サポートメール**: \`${sanitizeTfToken(data.supportEmail)}\`
- [ ] **公開ステータス**: 本番運用時は「本番環境」に設定

### スコープ設定

データアクセスのメニュー選択

- [ ] **../auth/userinfo.email** が追加済み
- [ ] **openid** が追加済み

> ⚠️ **注意**: スコープ設定が不適切だとCloudflare Accessでの認証に失敗します

### クライアント設定

1. クライアントのメニュー選択
2. 作成した OAuth 2.0 クライアント ID を選択

- [ ] **承認済みのリダイレクトURI**に以下が設定済み:
  \`\`\`
  ${data.redirectUri}
  \`\`\`

**認証情報について**

クライアントIDとクライアントシークレットを、tfvars に設定してください。

**terraform.${data.environment}.tfvars への記入例**:

> \`\`\`
> google_client_id = "123456789-abc.apps.googleusercontent.com"
> google_client_secret = "GOCSPX-your-secret-here"
> \`\`\`

> ⚠️ **注意**: クライアントシークレットの表示とダウンロードはできません。
> 初回に作成したシークレットを紛失した場合は、新しいシークレットを追加してください。
`,
  });

  // テスト手順
  sections.push({
    title: '✅ 設定完了後のテスト手順',
    level: 2,
    content: `
1. **terraform.tfvarsの更新**
   - Client IDとClient Secretを設定

2. **Cloudflare Stackのデプロイ**
   \`\`\`bash
   STACK=cloudflare ENVIRONMENT=${data.environment} npm run deploy:${data.environment}
   \`\`\`

3. **実際のGoogle認証フローをテスト**
   - https://${sanitizeTfToken(data.subdomainName)}.${sanitizeTfToken(data.domainName)} にアクセス
   - Google認証が正常に動作することを確認
   - 指定したメールドメインのユーザーのみアクセス可能であることを確認
`,
  });

  // トラブルシューティング
  sections.push({
    title: '🛠️ トラブルシューティング',
    level: 2,
    content: `
### よくある問題と解決方法

#### ❌ リダイレクトURIエラー
**症状**: "redirect_uri_mismatch" エラー
**解決**: OAuthクライアントのリダイレクトURIが正確に設定されているか確認

#### ❌ スコープエラー
**症状**: "insufficient_scope" エラー
**解決**: OAuth同意画面でuserinfo.emailとopenidスコープが設定されているか確認

#### ❌ アクセス拒否エラー
**症状**: 認証後にアクセスが拒否される
**解決**: Cloudflare Accessの設定でallowed_email_domainが正しく設定されているか確認

### サポート情報
- **プロジェクト管理**: [Google Cloud Console](https://console.cloud.google.com/home/dashboard?project=${sanitizeTfToken(
      data.projectId,
    )})
- **この設定の更新**: \`STACK=google ENVIRONMENT=${data.environment} npm run deploy:${data.environment}\`
`,
  });

  // Markdownを生成
  return sections
    .map(section => {
      const headingPrefix = '#'.repeat(section.level);
      return `${headingPrefix} ${section.title}\n\n${section.content.trim()}\n\n`;
    })
    .join('');
}

function generateValidationResultsMarkdown(validationResults: ValidationResults): string {
  let content = '';

  if (validationResults.clientIdValid) {
    content += '✅ **Client ID の形式**: 正常\n';
  }
  if (validationResults.clientSecretValid) {
    content += '✅ **Client Secret の形式**: 正常\n';
  }
  if (validationResults.projectNumberMatches) {
    content += '✅ **Project Number の整合性**: 正常\n';
  }

  if (validationResults.validationErrors && validationResults.validationErrors.length > 0) {
    content += '\n**❌ エラー**:\n';
    for (const error of validationResults.validationErrors) content += `- ${error}\n`;
  }

  if (validationResults.validationWarnings && validationResults.validationWarnings.length > 0) {
    content += '\n**⚠️ 警告**:\n';
    for (const warning of validationResults.validationWarnings) content += `- ${warning}\n`;
  }

  // 追加: 比較に使用した値の出力（解決できた場合のみ表示）
  if (validationResults.resolvedProjectNumber !== undefined) {
    const extracted = validationResults.extractedProjectNumber ?? '(不明)';
    const resolved = validationResults.resolvedProjectNumber;
    const cmp = validationResults.projectNumberMatches ? '一致' : '不一致';
    content += `\n**比較詳細**\n- Client ID 先頭数値: ${extracted}\n- 解決した Project Number: ${resolved}\n- 比較結果: ${cmp}\n`;
  }

  // 追加: OAuth クライアント認証の簡易チェック結果
  if (validationResults.oauthClientAuth) {
    const s = validationResults.oauthClientAuth.status;
    if (s === 'accepted') content += '\n✅ **OAuth クライアント認証**: 受付済み（invalid_grant 等は想定どおり）\n';
    else if (s === 'invalid') content += '\n❌ **OAuth クライアント認証**: 無効（invalid_client）\n';
    else if (s === 'skipped') content += '\nℹ️ **OAuth クライアント認証**: スキップ（資格情報不足/スクリプト未配置）\n';
    else content += '\n⚠️ **OAuth クライアント認証**: エラー（ネットワークや制限の可能性）\n';
  }

  // 追加: サービスアカウント診断（正常時）
  if (validationResults.resolvedProjectNumberStatus === 'ok') {
    const email: string = validationResults.serviceAccountEmail || '(不明)';
    const pn: string = validationResults.resolvedProjectNumber || '';
    content += '\n## ✅ サービスアカウント認証\n';
    content += `- サービスアカウント: ${email}\n`;
    if (pn) content += `- プロジェクト番号の取得: 成功（${pn}）\n`;
    const saPerm = validationResults.serviceAccountPermissions;
    if (saPerm && saPerm.status === 'ok') {
      const checked = Array.isArray(saPerm.checked) ? saPerm.checked : [];
      const granted = Array.isArray(saPerm.granted) ? saPerm.granted : [];
      if (checked.length) content += `- チェックした権限: ${checked.join(', ')}\n`;
      if (granted.length) content += `- 付与済み権限: ${granted.join(', ')}\n`;
    }
  }

  // 追加: サービスアカウント診断（認証エラーを明確化）
  if (validationResults.resolvedProjectNumberStatus === 'auth_error') {
    const detail: string = validationResults.resolvedProjectNumberDetail || '';
    const email: string = validationResults.serviceAccountEmail || '(Service Account Email: 不明)';
    content += '\n\n## ❌ サービスアカウント認証エラー\n';
    content += `- サービスアカウント: ${email}\n`;
    if (detail) content += `- エラー詳細: ${detail}\n`;

    const lower = detail.toLowerCase();
    if (lower.includes('account not found')) {
      content += '- 推定原因: サービスアカウントが削除/存在しない、またはプロジェクトが異なる\n';
    } else if (lower.includes('invalid jwt signature')) {
      content += '- 推定原因: キーの不一致（鍵が古い/別のSAの鍵）\n';
    }

    content += '\n### 対処手順\n';
    content += '1. **Google Cloud Console でサービスアカウント確認**\n';
    content += `   - [サービスアカウント一覧](https://console.cloud.google.com/iam-admin/serviceaccounts)で \`${email}\` が存在するか確認\n`;
    content += '   - 削除されている場合は新しいサービスアカウントを作成\n';
    content += '2. **新しいキーの生成**\n';
    content += `   - [サービスアカウント詳細](https://console.cloud.google.com/iam-admin/serviceaccounts/details/${encodeURIComponent(
      email,
    )})で「キー」タブを選択\n`;
    content += '   - 「キーを追加」→「新しいキーを作成」→「JSON」を選択してダウンロード\n';
    content += '3. **認証情報の設定**\n';
    content += '   - ダウンロードしたJSONファイルの内容を `.env` の `GOOGLE_CREDENTIALS` に設定（改行保持）\n';
    content += '   - または `GOOGLE_APPLICATION_CREDENTIALS` 環境変数でJSONファイルパスを指定\n';
  }

  // 追加: サービスアカウント診断（権限不足）
  if (validationResults.resolvedProjectNumberStatus === 'perm_error') {
    const detail: string = validationResults.resolvedProjectNumberDetail || '';
    const email: string = validationResults.serviceAccountEmail || '(不明)';
    content += '\n\n## ❌ サービスアカウント権限不足\n';
    content += `- サービスアカウント: ${email}\n`;
    if (detail) content += `- 詳細: ${detail}\n`;
    const saPermAll = validationResults.serviceAccountPermissions;
    if (saPermAll) {
      const checkedAll = Array.isArray(saPermAll.checked) ? saPermAll.checked : [];
      const grantedAll = Array.isArray(saPermAll.granted) ? saPermAll.granted : [];
      if (checkedAll.length) content += `- チェックした権限: ${checkedAll.join(', ')}\n`;
      if (grantedAll.length) content += `- 付与済み権限: ${grantedAll.join(', ')}\n`;
    }
    const saPerm = validationResults.serviceAccountPermissions;
    if (saPerm && saPerm.missing && saPerm.missing.length > 0) {
      content += `- 不足している権限: ${saPerm.missing.join(', ')}\n`;
    } else if (detail.startsWith('missing_permissions:')) {
      const list = detail.replace('missing_permissions:', '').split(',').filter(Boolean);
      if (list.length) content += `- 不足している権限: ${list.join(', ')}\n`;
    }
    content += '\n### 対処手順\n';
    content += '1. **Google Cloud Console でIAM権限を確認・追加**\n';
    content += `   - [IAM権限管理](https://console.cloud.google.com/iam-admin/iam)でサービスアカウント \`${email}\` を検索\n`;

    let missingPerms: string[] = [];
    if (saPerm && saPerm.missing) {
      missingPerms = saPerm.missing;
    } else if (detail.startsWith('missing_permissions:')) {
      missingPerms = detail.replace('missing_permissions:', '').split(',').filter(Boolean);
    }

    if (missingPerms.length > 0) {
      content += '2. **不足している権限を個別に追加**\n';
      missingPerms.forEach((perm, index) => {
        content += `   ${index + 1}. \`${perm.trim()}\`\n`;
      });
      content += '3. **推奨ロール**\n';
      if (missingPerms.some(p => p.includes('resourcemanager.projects'))) {
        content += '   - **Project Browser** または **Project Viewer** ロールを付与\n';
      }
      if (missingPerms.some(p => p.includes('iam'))) {
        content += '   - **Security Reviewer** ロール（IAM関連の参照用）\n';
      }
    } else {
      content += '2. **推奨ロール**\n';
      content += '   - **Project Viewer** ロール（読み取り専用での検証用途）\n';
      content += '   - または **Project Browser** ロール（より限定的な権限）\n';
    }
    content += '\n> 💡 **ヒント**: 検証ツール用途なので最小権限（読み取りのみ）で十分です\n';
  }

  content +=
    '\n> 📋 **補足**: Client ID 先頭の数値は Project Number です。client_id/secret の有効性はトークンエンドポイント応答で簡易確認しています（invalid_grant=受理、invalid_client=無効）。\n';

  return content;
}

/**
 * Markdownファイルを指定パスに出力
 */
export function writeMarkdownFile(filePath: string, content: string): void {
  const dir = path.dirname(filePath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }
  fs.writeFileSync(filePath, content, 'utf8');
}

/**
 * Google OAuth設定チェックリストファイルを生成・出力
 */
export function generateAndWriteOAuthChecklist(data: GoogleOAuthChecklistData, outputPath?: string): string {
  const markdown = generateOAuthChecklistMarkdown(data);
  const defaultPath = `oauth-checklist-${data.environment}-${Date.now()}.md`;
  const filePath = outputPath || defaultPath;

  writeMarkdownFile(filePath, markdown);
  return filePath;
}
