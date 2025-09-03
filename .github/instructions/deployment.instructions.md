---
applyTo: '**/*'
---

# デプロイメント・実行準備

## 必要な設定値

実際の Cloudflare インフラをデプロイする前に、以下の設定を行う必要があります。
これらの値がないと Terraform の実行時にエラーになります。

**必要な設定値（すべて必須）:**

1. **Cloudflare**: API Token + Account ID
2. **ドメイン**: Domain Name + Subdomain Name + Target IP Address
3. **Google OAuth**: Client ID + Client Secret + Allowed Email Domain

**設定方法:**

```bash
# 環境別にterraform.tfvars.exampleをコピーして編集
# 開発環境
cp terraform.tfvars.example terraform.dev.tfvars

# 本番環境
cp terraform.tfvars.example terraform.prod.tfvars

# 各ファイルを環境に応じた実際の値に編集
# その後、環境を指定してコマンド実行: npm run deploy:dev または npm run deploy:prod
```

**開発環境について**

開発環境は、本番環境に影響を与えられない場合に準備してください。
例えば、異なるアカウントを作成するとか、異なるドメインを使うとか、同じドメインにサブドメイン違いで作成するとか、状況に合わせて作成してください。

ゼロトラストで、例えば、社内ユーザーにのみ影響があるようなケースでは、本番環境でデプロイのテストをしても問題ない場合もあると思うので、そういう場合は、prod だけでテストしてよいと思います。

### API キーの取得方法

#### 1. Cloudflare API Token

**ローカル開発/テスト用 - User API Token:**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/profile/api-tokens)にアクセス
2. "Create Token" をクリック
3. **"Custom token"** を選択（"Edit zone DNS"テンプレートでは権限不足）
4. 権限設定の詳細は [サンプル実装ドキュメント](../docs/SAMPLE_DEPLOYMENT.md#セキュリティ設定) を参照
5. 対象の Account Resources と Zone Resources を指定
6. トークンを生成

**CI/CD 用 - アカウント API Token（推奨）:**

1. [Cloudflare Dashboard](https://dash.cloudflare.com/) → 左サイドバー "Manage Account"
2. "API Tokens" タブ
3. "Create Token" をクリック
4. **"Custom token"** を選択
5. **Token name**: `CDKTF-Deploy-Service-Account` （分かりやすい名前）
6. 権限設定の詳細は [サンプル実装ドキュメント](../docs/SAMPLE_DEPLOYMENT.md#セキュリティ設定) を参照
7. **Account Resources**: 対象アカウントを指定
8. **Zone Resources**: Include - Specific zone - 対象ドメインを指定
9. **IP Address filtering**: （必要に応じて）CI/CD サーバーの IP を制限
10. **TTL**: 設定しない（無期限）または適切な期間を設定

**セキュリティのベストプラクティス:**

- **CI/CD**: 専用のサービスアカウント的な API Token 使用
- **権限最小化**: 必要な権限のみ付与
- **IP 制限**: 可能であれば CI/CD サーバーの IP で制限
- **定期ローテーション**: 定期的にトークンを更新

#### 2. Cloudflare Account ID

1. [Cloudflare Dashboard](https://dash.cloudflare.com/)にアクセス
2. Account ID の確認方法（以下のいずれかの場所）:
   - 画面右下のサイドバー
   - ページ下部の「Account ID」欄
   - URL の一部: `dash.cloudflare.com/{account-id}/`
   - Overview ページの Account Details セクション
3. **注意**: これは Google OAuth Client ID とは全く別のものです

#### 3. Google OAuth 設定

**推奨 3 段階ワークフロー:**
詳細な手順は [Google OAuth 設定完全ガイド](../docs/GOOGLE_OAUTH_SETUP.md) を参照

**段階 1: 開発段階（個人アカウント）**

- `gcloud auth application-default login` で迅速開始
- Google Stack デプロイで OAuth 設定ガイダンス確認
- Google Cloud Console で手動 OAuth 設定

**段階 2: 検証段階（サービスアカウント）**

- サービスアカウント作成: `cdktf-google-oauth-deploy`
- 権限: OAuth Config Editor, Browser （最小権限）
- 手動設定内容の動作確認・設定ミス検出

**段階 3: 本番段階（サービスアカウント）**

- 検証済みサービスアカウントで CI/CD・本格運用
- セキュリティ・自動化対応

**OAuth クライアント作成:**

1. APIs & Services → Credentials → Create Credentials → OAuth 2.0 Client IDs
2. Application type: Web application
3. Authorized redirect URIs: `https://<your-team-name>.cloudflareaccess.com/cdn-cgi/access/callback`
4. **作成後に取得**:
   - Client ID (例: `123456789.apps.googleusercontent.com`)
   - Client Secret (例: `GOCSPX-abcd1234efgh5678`)

**重要**: Google OAuth の Client ID/Secret と Cloudflare の Account ID は全く異なるサービスの認証情報です。

## 前提条件

## 実行コマンドの順序

### 1. 開発・テスト段階

```bash
# 依存関係のインストール
npm install

# コードのビルド確認
npm run build

# テストの実行
npm test

# Terraformコードの生成確認
npm run synth:dev     # 開発環境用

# デプロイ確認
npm run plan:dev     # デプロイプラン確認
npm run deploy:dev   # 実際のデプロイ実行
npm run output:dev   # デプロイ後の確認
```

### 2. 実際のデプロイ段階

```bash
# Terraform/OpenTofuの初期化
npm run get
# 注意: "No providers or modules found"の警告は正常（package.jsonで管理）

# Terraformコードの生成
npm run synth:prod    # 本番環境用

# デプロイ
npm run plan:prod     # デプロイプラン確認
npm run deploy:prod   # 実際のデプロイ実行
npm run output:prod   # デプロイ後の確認
```

**注意:** `terraform.tfvars`ファイルは OpenTofu が自動で読み込むため、環境変数の設定は不要です。

### 3. 削除・クリーンアップ

```bash
# 開発環境のインフラ削除
npm run destroy:dev

# 本番環境のインフラ削除
npm run destroy:prod

# Terraform stateファイルのクリーンアップ（API Token権限エラー時など）
npm run clean:state

# 全ビルド成果物とstateファイルの削除
npm run clean

# 完全リセット（依存関係再インストール + プロバイダー取得）
npm run reset
```

## CI/CD での使用

### GitHub Actions での設定例

```yaml
name: Deploy Infrastructure
on:
  push:
    branches: [main]
  workflow_dispatch:

jobs:
  deploy:
    runs-on: ubuntu-latest
    steps:
      - uses: actions/checkout@v4
      - uses: actions/setup-node@v4
        with:
          node-version: '20'
          cache: 'npm'

      - name: Install dependencies
        run: npm ci

      - name: Install OpenTofu
        run: |
          curl -fsSL https://get.opentofu.org/install-opentofu.sh | sudo sh
          sudo ln -sf /usr/bin/tofu /usr/bin/terraform

      - name: Create terraform.prod.tfvars
        run: |
          cat > terraform.prod.tfvars << EOF
          cloudflare_api_token = "${{ secrets.CLOUDFLARE_API_TOKEN }}"
          cloudflare_account_id = "${{ secrets.CLOUDFLARE_ACCOUNT_ID }}"
          domain_name = "example.com"
          subdomain_name = "app"
          target_ip_address = "${{ secrets.TARGET_IP_ADDRESS }}"
          google_client_id = "${{ secrets.GOOGLE_CLIENT_ID }}"
          google_client_secret = "${{ secrets.GOOGLE_CLIENT_SECRET }}"
          allowed_email_domain = "yourcompany.com"
          ENVIRONMENT = "prod"
          EOF

      - name: Deploy infrastructure
        run: |
          npm run get
          npm run plan:prod
          npm run deploy:prod
```

### GitHub Secrets の設定

Repository Settings → Secrets and variables → Actions で以下を設定：

- `CLOUDFLARE_API_TOKEN`: CI/CD 用アカウント API トークン
- `CLOUDFLARE_ACCOUNT_ID`: Cloudflare アカウント ID
- `TARGET_IP_ADDRESS`: デプロイ先サーバーの IP アドレス
- `GOOGLE_CLIENT_ID`: Google OAuth Client ID
- `GOOGLE_CLIENT_SECRET`: Google OAuth Client Secret

## セキュリティ上の注意事項

- **API キーや認証情報は絶対にコミットしない**
- **CI/CD**: GitHub Secrets や CI/CD システムのシークレット管理機能を使用
- **ローカル開発**: `terraform.*.tfvars`ファイルを使用（`.gitignore`で除外済み）
- **本番環境**: 専用のサービスアカウント的な API トークンを使用
- **権限最小化**: 必要な権限のみ付与
- **定期ローテーション**: API トークンを定期的に更新

## トラブルシューティング

### よくあるエラー

1. **`spawn terraform ENOENT` エラー**

   - OpenTofu がインストールされているが CDKTF が terraform コマンドを探している
   - **devcontainer 使用時**: Dockerfile で自動的にシンボリックリンクを作成済み
   - **ローカル環境**: `sudo ln -sf /usr/bin/tofu /usr/bin/terraform`でシンボリックリンクを作成

2. **`WARNING: No providers or modules found` 警告**

   - `npm run get`実行時に表示される警告
   - **正常な動作**: プロバイダーは package.json で管理されているため
   - 対応不要（cdktf.json では`"terraformProviders": []`に設定済み）

3. **`No value for required variable` エラー**

   - `npm run plan`や`npm run deploy`実行時に発生
   - **原因**: `terraform.tfvars`ファイルが存在しないか、必須変数が設定されていない
   - **対処法**: `terraform.tfvars.example`をコピーして実際の値を設定

4. **`Could not find provider` エラー**

   - cdktf.json の terraformProviders と package.json のバージョンが不一致
   - 対処法: cdktf.json で`"terraformProviders": []`に設定（package.json で管理）

5. **API Token 権限不足**

   - **症状**: `403 Forbidden`エラー、`Authentication error`
   - **原因**: Cloudflare API Token の権限不足
   - **必要な権限**: [サンプル実装ドキュメント](../docs/SAMPLE_DEPLOYMENT.md#セキュリティ設定) を参照
   - **対処法**: 正しい権限で Custom token を再作成

6. **Account ID 不正**

   - Cloudflare ダッシュボードで Account ID が正しいか確認

7. **Google OAuth 設定エラー**

   - リダイレクト URI が Cloudflare Access 設定と一致しているか確認

8. **ドメインアクセス権限**
   - 指定したドメインが Cloudflare アカウントで管理されているか確認
