# サンプル実装：Cloudflare Zero Trust 構成

このドキュメントでは、ボイラープレートに含まれているサンプル実装について説明します。

## 概要

Cloudflare Zero Trust を使用したセキュアな Web アプリケーション構成のサンプルです。

### アーキテクチャ

```
ユーザー → Cloudflare Zero Trust → Cloudflare Proxy → オリジンサーバー（HTTP）
         (Google OAuth認証)      (SSL/TLS終端)
```

## 実装内容

### 1. Cloudflare スタック (`cloudflare-stack`)

- **DNS 設定**: サブドメインを作成し、Cloudflare プロキシを有効化
- **SSL/TLS**: Flexible モードで暗号化（Cloudflare↔ ユーザー間のみ SSL）
- **Zero Trust Access**: Google OAuth 認証による アクセス制御
- **アクセスポリシー**: 指定されたメールドメインのみアクセス許可

### 2. AWS セキュリティグループスタック (`aws-sg-enforce-inline`)

- **既存 SG 管理**: 指定されたセキュリティグループのルールを厳格管理
- **Cloudflare IP レンジ**: 自動取得して HTTP(80)ポートのみ許可
- **セキュリティ**: オリジンサーバーへの直接アクセスを防止

## デプロイ方法

### 前提条件

1. **Cloudflare アカウント**: ドメイン管理権限
2. **Google Cloud Console**: OAuth 設定
3. **AWS**: EC2 インスタンスとセキュリティグループ
4. **HTTP サーバー**: 80 番ポートで動作

### 設定手順

1. **環境変数設定** (`.env`ファイル)

   ```bash
   AWS_ACCESS_KEY_ID=your-key
   AWS_SECRET_ACCESS_KEY=your-secret
   AWS_REGION=ap-northeast-1
   SG_ID=sg-xxxxxxxxx
   ```

2. **Terraform 変数設定** (`terraform.prod.tfvars`)
   ```hcl
   cloudflare_api_token = "your-token"
   cloudflare_account_id = "your-account-id"
   domain_name = "example.com"
   subdomain_name = "app"
   target_ip_address = "203.0.113.1"
   google_client_id = "your-client-id"
   google_client_secret = "your-secret"
   allowed_email_domain = "yourcompany.com"
   ```

### デプロイコマンド

#### 自動デプロイスクリプト（推奨）

全てのデプロイコマンドを連続実行する便利なスクリプトが用意されています：

```bash
# 本番環境に全スタックをデプロイ
scripts/cdktf-reset-and-deploy.sh prod all

# 本番環境にCloudflareスタックのみデプロイ
scripts/cdktf-reset-and-deploy.sh prod cloudflare

# 本番環境にAWSセキュリティグループスタックのみデプロイ
scripts/cdktf-reset-and-deploy.sh prod aws-sg-enforce-inline

# 開発環境に全スタックをデプロイ
scripts/cdktf-reset-and-deploy.sh dev all
```

このスクリプトは以下を自動実行します：

- ローカルステートのクリーンアップ
- プロバイダーの取得
- Terraform コードの生成（Synthesize）
- デプロイプランの確認
- 実際のデプロイ実行

#### 手動デプロイコマンド

個別にコマンドを実行する場合：

```bash
# Cloudflareスタック
ENVIRONMENT=prod STACK=cloudflare npm run deploy:prod

# AWS セキュリティグループ
ENVIRONMENT=prod STACK=aws-sg-enforce-inline npm run deploy:prod
```

## セキュリティ設定

### Cloudflare API Token 権限

「アカウント API トークン」を作成します。
以下の権限が必要です。

- 権限
  - アカウント:
    - **Zero Trust**:編集
    - **アクセス: 組織、ID プロバイダー、およびグループ**:編集
    - **アカウント設定**:読み取り
    - **アクセス: アプリおよびポリシー**:編集
  - ゾーン:
    - **DNS**:編集
    - **DNS 設定**:編集
    - **ゾーン設定**:編集
- ゾーンリソース
  - 含む
    - 特定のゾーン
      - example.com

### Google OAuth 設定

1. Google Cloud Console でプロジェクト作成
2. OAuth 2.0 Client ID を作成
3. リダイレクト URI: `https://<your-team>.cloudflareaccess.com/cdn-cgi/access/callback`

## トラブルシューティング

### よくある問題

1. **522 エラー**: SSL/TLS 設定が Full になっている → Flexible に変更
2. **521 エラー**: セキュリティグループで Cloudflare IP が許可されていない

### 確認方法

DNS 解決確認

```bash
nslookup app.example.com
```

Cloudflare プロキシ確認は、認証が作用するので、ブラウザで確認します

<https://app.example.com>

## 既存リソースのインポート

既存の Cloudflare リソース（DNS レコード、Access アプリケーションなど）を CDKTF で管理したい場合は、[Cloudflare インポートガイド](./CLOUDFLARE_IMPORT.md) を参照してください。

## カスタマイズ

このサンプルをベースに、以下のようなカスタマイズが可能です：

- 複数環境（dev/staging/prod）への対応
- 異なる認証プロバイダー（SAML、OIDC 等）
- 追加のセキュリティポリシー
- カスタムドメインと SSL 証明書

## 制限事項

- オリジンサーバーは HTTP のみ対応
- Google OAuth 認証必須
- 単一ドメイン・サブドメインのみ
