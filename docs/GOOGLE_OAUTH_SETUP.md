# Google OAuth 設定ガイド（Cloudflare Zero Trust 連携）

Cloudflare Zero Trust Access と Google 認証（OAuth 2.0）の連携手順です。

このリポジトリでは、ガイダンスの生成・最小限の自動検証（サービスアカウントでの権限チェックなど）を実装し、実体の作成・変更は手動で行う方針です。

要点
- 自動検証はサービスアカウント（GOOGLE_CREDENTIALS/GOOGLE_APPLICATION_CREDENTIALS）前提（gcloud/ADC は不要）
- 必須 API は Cloud Resource Manager のみ（oauth2.googleapis.com は有効化不要）
- OAuth クライアントの作成や同意画面設定は Google Cloud Console で手動実施
- 保護対象のドメイン/サブドメインを変更しても、Cloudflare Access 連携では通常「同じ OAuth クライアント」を継続利用可能（チームドメインが変わる場合は別クライアント推奨）

---

## 前提条件

- Google Cloud Console にアクセス可能
- Cloudflare Zero Trust チームが用意済み
- サービスアカウント（JSON キー）を用意し、最小権限で運用
  - 推奨ロール（読み取り検証用）: Project Viewer もしくは Project Browser

## 必須/任意 API

- 必須
  - Cloud Resource Manager API（cloudresourcemanager.googleapis.com）
- 任意（運用に応じて）
  - Identity and Access Management (IAM) API（iam.googleapis.com）
  - IAM Service Account Credentials API（iamcredentials.googleapis.com）

補足
- OAuth 2.0 トークンエンドポイント（oauth2.googleapis.com）は有効化不要です。

---

## 全体フロー

1) tfvars と .env の準備（Client ID/Secret、GOOGLE_CREDENTIALS 等）
2) チェックリスト生成（自動検証実行）
   - `STACK=google ENVIRONMENT=prod npm run synth:prod:quiet`
   - 生成された `oauth-checklist-<env>.md` に従って手動設定・確認
   - サービスアカウントの検証結果（チェックした権限/付与済み権限）も md に出力
3) Cloudflare Stack の適用（必要時）
4) 実際の認証フローをテスト

---

## OAuth クライアント作成（手動）

1. Google Cloud Console → API とサービス → 認証情報 → 認証情報を作成
2. OAuth 同意画面を設定（アプリ名、サポートメール、スコープなど）
3. OAuth 2.0 クライアント ID を作成（種類: ウェブアプリケーション）
4. リダイレクト URI に以下を追加（Cloudflare Access 固定）
   - `https://<team>.cloudflareaccess.com/cdn-cgi/access/callback`
5. Client ID/Secret を `terraform.<env>.tfvars` に設定

注意
- Cloudflare の保護対象（例: hp.example.com）を変更しても、Cloudflare 側のアプリ URL を更新するだけで、通常は同じ Client ID/Secret を流用可能です（チームドメインが変わる場合は新しいクライアント推奨）。

---

## サービスアカウント運用

### 設定

方法 1: JSON ファイルパス
```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/key.json"
```

方法 2: JSON 本文（推奨）
```bash
export GOOGLE_CREDENTIALS='{"type":"service_account","project_id":"your-project",...}'
```

.env 例
```env
# .env（どちらか一方を設定）
GOOGLE_CREDENTIALS='{"type":"service_account","project_id":"your-project",...}'
# GOOGLE_APPLICATION_CREDENTIALS=/abs/path/to/key.json
```

### 自動検証で確認する権限

- 既定: `resourcemanager.projects.get`
- 追加で確認したい場合は環境変数で指定（カンマ区切り）
  - 例: `SA_REQUIRED_PERMS="resourcemanager.projects.get,serviceusage.services.list"`
- 検証結果は `oauth-checklist-<env>.md` の「✅ サービスアカウント認証」に、チェックした権限/付与済み権限として出力されます。

---

## 認証確認の実行（このリポジトリの機能）

```bash
set -a; source .env; set +a
STACK=google ENVIRONMENT=prod npm run synth:prod:quiet
```

出力
- コンソール: 生成された Markdown のパスのみ
- Markdown: 自動検証結果（SA 認証/権限、Client ID/Secret 形式、Project Number 整合性）と手動確認チェックリスト

---

## セキュリティの注意

- JSON キーは Git にコミットしない
- 最小権限で運用（読み取りのみで検証可能）
- 定期的なキーのローテーション

---

## 補足：Cloudflare 側の設定

- Cloudflare Zero Trust → アクセス → アプリケーション → 追加
- アプリ種別: Self-hosted
- アプリのドメイン: 保護対象（例: hp.example.com）
- ID プロバイダー: Google（上記の Client ID/Secret を設定）

## 詳細手順

### 1. Google Cloud プロジェクトの準備

1. [Google Cloud Console](https://console.cloud.google.com/) にアクセス
2. プロジェクトを作成または選択
   - **新規作成の場合**: 画面上部のプロジェクト選択 → 「新しいプロジェクト」
   - **プロジェクト名例**: `my-google-oauth-project`
   - **プロジェクト ID**: 自動生成されるか手動入力（6-30 文字、小文字・数字・ハイフンのみ）

### 2. 必要な API の有効化

左サイドメニュー → **API とサービス** → **ライブラリ** で以下の API を有効化:

- ✅ **Identity and Access Management (IAM) API**
- ✅ **Cloud Resource Manager API**
- ✅ **Service Usage API**
- ✅ **IAM Service Account Credentials API**

各 API を検索 → **有効にする** をクリック

### 3. サービスアカウントの作成

1. 左サイドメニュー → **IAM と管理** → **サービス アカウント**
2. **サービス アカウントを作成** をクリック

#### サービスアカウントの詳細設定:

- **サービス アカウント名**: `cdktf-google-oauth-deploy`
- **サービス アカウント ID**: `cdktf-google-oauth-deploy` (自動生成)
- **説明**: `CDKTF Google OAuth deployment service account`

### 4. 権限の設定

**このサービス アカウントにプロジェクトへのアクセス権を付与** で以下の役割を追加:

- ✅ **OAuth Config Editor** (`roles/oauthconfig.editor`)
  - 用途: OAuth 2.0 クライアント作成・編集・削除
- ✅ **Browser** (`roles/browser`)
  - 用途: プロジェクト情報の参照
- ✅ **Service Account Admin** (`roles/iam.serviceAccountAdmin`) ※プロジェクト作成時のみ
  - 用途: サービスアカウント管理（通常は不要）

**補足**:
フィルターで `または` がサジェストされるので、
`roles/oauthconfig.editor または roles/browser または roles/iam.serviceAccountAdmin` と入力して、3 つを選択して保存するのが簡単です。

### 5. サービスアカウントキーの作成

1. 作成したサービスアカウント (`cdktf-google-oauth-deploy`) をクリック
2. **キー** タブを選択
3. **鍵を追加** → **新しい鍵を作成**
4. **キータイプ**: **JSON** を選択
5. **作成** をクリック
6. JSON ファイルが自動ダウンロード

## 使用方法

### ローカル開発環境

#### 方法 1: 環境変数でファイルパス指定

```bash
export GOOGLE_APPLICATION_CREDENTIALS="/path/to/downloaded-key.json"
```

#### 方法 2: 環境変数で JSON 内容指定（推奨）

```bash
export GOOGLE_CREDENTIALS='{"type": "service_account", "project_id": "your-project", ...}'
```

#### .env ファイル使用例

```bash
# .envファイル内（どちらかを設定）
GOOGLE_APPLICATION_CREDENTIALS=/home/user/my-google-oauth-project-key.json
GOOGLE_CREDENTIALS='{"type": "service_account", "project_id": "your-project", ...}'
```

### CI/CD 環境（GitHub Actions 等）

1. ダウンロードした JSON ファイルの**内容全体**をコピー
2. CI/CD システムのシークレット管理に登録:
   - **GitHub Actions**: Repository Settings → Secrets → `GOOGLE_CREDENTIALS`
   - **GitLab CI**: Project Settings → CI/CD → Variables → `GOOGLE_CREDENTIALS`

## セキュリティ対策

### 必須事項

- ❌ **JSON キーファイルを Git リポジトリにコミットしない**
- ❌ **公開リポジトリにキーを置かない**
- ✅ **最小権限の原則を守る**
- ✅ **定期的にキーをローテーション**

### .gitignore の確認

GOOGLE_APPLICATION_CREDENTIALS で指定する場合、念のため、以下を `.gitignore` に追加:

```gitignore
# Google Cloud service account keys
*-key.json
*.json
!package*.json
```

## 認証確認方法

### 認証が正しく設定されているか確認:

```bash
# 環境変数確認（Google Cloud SDK不要）
echo $GOOGLE_CREDENTIALS
echo $GOOGLE_APPLICATION_CREDENTIALS

# Google Cloud SDK使用時（オプション）
gcloud auth list
```

**注意**: このプロジェクトでは **Google Cloud SDK は不要** です。サービスアカウントキーによる環境変数認証で十分です。

### サービスアカウント作成の自動化について

サービスアカウント作成は技術的に自動化可能ですが、**認証の鶏と卵問題**があります：

**自動化の選択肢:**

1. **個人アカウント認証** → `gcloud auth application-default login` → 自動作成
2. **組織管理者権限** → ブートストラップ用アカウント → 自動作成
3. **Google Cloud Shell** → 認証済み環境 → 自動作成

**推奨アプローチ:**

- **開発・テスト**: 個人アカウント認証（`gcloud auth application-default login`）
- **本格運用・CI/CD**: サービスアカウント作成（セキュリティ・権限分離）

### CDKTF での動作確認:

```bash
# Google stackの合成テスト
STACK=google ENVIRONMENT=prod npm run synth:prod
```

## 段階別実行手順

### 段階 1: 開発段階（個人アカウント認証）

**1. Google Cloud SDK 認証**

```bash
# 個人アカウントで認証（最も簡単）
gcloud auth application-default login
```

**2. Google Stack デプロイ**

```bash
# OAuth設定ガイダンスを表示
STACK=google ENVIRONMENT=dev npm run deploy:dev
```

**3. 手動 OAuth 設定**

- 出力されたガイダンスに従って Google Cloud Console で設定
- Client ID/Secret を terraform.tfvars に設定

### 段階 2: 検証段階（サービスアカウント認証）

**1. サービスアカウント作成**
必要に応じて詳細手順を参照してサービスアカウントを作成

**2. 認証情報の設定**

```bash
# .envファイルに追加
GOOGLE_CREDENTIALS='{"type": "service_account", "project_id": "my-google-oauth-project", ...}'
```

**3. サービスアカウントでの動作確認**

```bash
# 同じ結果が得られるか検証
STACK=google ENVIRONMENT=dev npm run deploy:dev
```

**検証のメリット:**

- ✅ **設定ミスの早期発見**: リダイレクト URI、スコープ設定の確認
- ✅ **権限確認**: 最小権限で正常動作するか確認
- ✅ **本番環境準備**: CI/CD デプロイ前の事前テスト

### 段階 3: 本番段階（サービスアカウント認証）

**CI/CD 環境での設定:**

```bash
# GitHub ActionsのSecretsに設定
GOOGLE_CREDENTIALS = <JSONファイルの内容全体>
```

### 2. Google Stack のデプロイ実行

```bash
# Terraform設定ファイル生成
STACK=google ENVIRONMENT=prod npm run synth:prod

# プランの確認
STACK=google ENVIRONMENT=prod npm run plan:prod

# デプロイ実行（OAuth設定ガイダンスを出力）
STACK=google ENVIRONMENT=prod npm run deploy:prod
```

### 3. 出力されるガイダンス情報の確認

デプロイ完了後、以下の情報が出力されます：

- **Google Cloud Console URL** - OAuth 設定画面への直リンク
- **リダイレクト URI** - Cloudflare Access 用の認証コールバック URL
- **terraform.tfvars 設定テンプレート** - 必要な変数設定例

### 4. 手動での OAuth 2.0 クライアント作成

1. **出力された Console URL にアクセス**
2. **OAuth 同意画面の設定**（初回のみ）:
   - 対象:
     - **Internal**: G Workspace 契約組織内のアカウントでの認証が可能
     - **External**: @gmail.com を含む任意の Google アカウントでの認証が可能
   - アプリケーション名: アプリケーション名を入力
   - ユーザーサポートメール: サポート用メールアドレス
     - 本来のメールアドレスが選択肢にない場合がありますが、あとから変更可能なので、自分のアドレスを選択しておけば問題ありません
   - Developer contact information: 開発者連絡先
3. **OAuth 2.0 クライアント ID の作成**:
   - Application type: **Web application**
   - Name: `Cloudflare Access Integration`
   - 承認済みのリダイレクト URI: **出力された redirect_uri を使用**
4. **Client ID/Secret を取得**

設定画面は変更される可能性があります。
設定項目の出現順が上記と異なる場合もあります。

### 5. terraform.tfvars の更新

```bash
# 取得したOAuth情報をterraform.tfvarsに設定
google_client_id = "123456789.apps.googleusercontent.com"
google_client_secret = "GOCSPX-your-client-secret"
```

### 6. Cloudflare Stack のデプロイ

OAuth 設定完了後、Cloudflare Zero Trust Access をデプロイ:

```bash
# Cloudflareスタックのデプロイ
STACK=cloudflare ENVIRONMENT=dev npm run deploy:dev
```

## なぜ手動設定が必要なのか

### OAuth 2.0 クライアント自動作成の制約

1. **OAuth 同意画面の初期設定**:

   - アプリ名、ロゴ、利用規約 URL 等は必ず手動設定が必要
   - Google 審査プロセスがある（本番公開時）

2. **必要な権限の複雑さ**:

   - 自動化には `roles/iam.securityAdmin` 等の強力な権限が必要
   - セキュリティリスクが増加

3. **Terraform プロバイダーの制限**:
   - Google OAuth Client リソースは存在するが設定項目が限定的
   - エラーハンドリングが複雑で実用性が低い

### 推奨アプローチの利点

現在の**半自動アプローチ**（ガイダンス提供 + 手動設定）の利点:

- ✅ **セキュリティ**: 最小権限でサービスアカウント作成
- ✅ **実用性**: 必要な情報を自動生成して手動作業を最小化
- ✅ **保守性**: 複雑な自動化ロジックを避けてシンプル維持
- ✅ **柔軟性**: 組織ポリシーや要件に応じた手動調整が可能

## トラブルシューティング

### よくあるエラー

#### 1. `google: could not find default credentials`

**原因**: 認証情報が設定されていない
**解決**: 上記の認証情報設定を実行

#### 2. `Error 403: Forbidden`

**原因**: サービスアカウントの権限不足
**解決**: 必要な権限（Editor 等）を付与

#### 3. `API not enabled`

**原因**: 必要な API が有効化されていない
**解決**: 上記「必要な API の有効化」を実行

## 参考リンク

- [Google Cloud 認証概要](https://cloud.google.com/docs/authentication)
- [サービスアカウント作成](https://cloud.google.com/iam/docs/creating-managing-service-accounts)
- [Application Default Credentials](https://cloud.google.com/docs/authentication/external/set-up-adc)
