# Galileo WordPress IaC

Galileo WordPress プロジェクト向けの CDK for Terraform (CDKTF) 構成一式です。Cloudflare / Google Workspace / AWS などのスタックを組み合わせ、`@minr-dev/cdktf-toolkit` ライブラリに切り出した共通コンポーネントを利用します。

## リポジトリ構成

```
projects/
├── galileo-wp-iac        # 本プロジェクト（環境変数とスタック選択を担う）
└── cdktf-toolkit         # 共通ライブラリ（file 依存として参照）
```

- リポジトリ内では `galileo-wp-iac` と `cdktf-toolkit` が隣接するディレクトリとして配置されます。
- `package.json` では `"@minr-dev/cdktf-toolkit": "file:../cdktf-toolkit"` と定義しているため、`npm install` 時にローカルディレクトリが解決されます。

## 事前準備

1. **AWS リモートステートの準備**

   - **初回セットアップ時は必須**: Terraform ステート管理用の S3 バケットと DynamoDB テーブルを作成
   - 詳細手順: **[docs/AWS_REMOTE_STATE_SETUP.md](docs/AWS_REMOTE_STATE_SETUP.md)** を参照

2. **依存ディレクトリの配置**

   - モノレポ利用時は `projects/cdktf-toolkit` が既に存在します。
   - `galileo-wp-iac` を単独利用する場合は、同階層に `cdktf-toolkit` をクローンまたはサブモジュールとして配置してください。

     ```bash
     git clone git@github.com:your-org/cdktf-toolkit.git ../cdktf-toolkit
     ```

3. **ランタイム環境変数の設計指針**
   - **設定はすべて環境変数で統一**します（`.tfvars` は原則使用しません）。
   - 非機密値は通常の環境変数で設定します。
     - `.env.example` をベースに `.env` を作成してください。
     - 代表例: `BASE_DOMAIN_DEV/PROD`, `SUB_DOMAIN_DEV/PROD`, `S3_MEDIA_BUCKET_NAME_DEV/PROD`, `IAM_POLICY_NAME_DEV/PROD`, `IAM_USER_NAME_DEV/PROD`。
     - AWS 認証情報やリージョンなどもこの方式で設定します。
   - 機密値は `TF_VAR_<variable>` 形式の環境変数に限定します。
     - 例: `export TF_VAR_cloudflare_api_token=...`。
     - Cloudflare API Token や Google OAuth Secret などの特権情報はこの形式で渡してください。
   - 通常の環境変数を使わない理由
     例えば、TerraformStack や Construct の Props などで受け渡す実装をしてしまいガチですが、その場合には、cdk.tf.json に平文で出力されてしまいます。Terraform の state は、ローカルでの実行や CD/CI での実行など、実行環境が違う場合を想定して、リモートで state 管理するため、セキュリティ上のリスクになります。

## 開発環境の起動

```bash
# Docker Compose で CDKTF 用コンテナを起動
cd projects/galileo-wp-iac
docker compose up -d

# コンテナ内シェルへ接続
docker compose exec cdktf bash

# 依存パッケージの取得（ローカル file 依存が解決される）
npm install
```

`docker-compose.yml` では `../cdktf-toolkit` をコンテナ内にもマウントしているため、単独運用時でもローカルパッケージを参照できます。

## よく使うコマンド

```bash
npm run get        # プロバイダコード生成
npm run build      # TypeScript ビルド
npm run synth      # Terraform 定義を生成
npm run plan       # 変更差分を確認
npm run deploy     # スタックをデプロイ
npm run destroy    # スタックを破棄

npm run lint       # ESLint チェック
npm test           # Jest テスト
```

環境別に実行する場合は `ENVIRONMENT` と `STACK` を指定します。

```bash
ENVIRONMENT=dev STACK=cloudflare npm run plan
```

### 環境変数設定のガイド

- 機密値（Cloudflare API Token など）は `export TF_VAR_cloudflare_api_token=...` のように **`TF_VAR_` プレフィックス付きの環境変数** で渡します。
- 非機密な環境固有値も通常の環境変数で管理します（例: `BASE_DOMAIN_DEV/PROD`, `SUB_DOMAIN_DEV/PROD`, `S3_MEDIA_BUCKET_NAME_DEV/PROD`, `IAM_POLICY_NAME_DEV/PROD`, `IAM_USER_NAME_DEV/PROD`）。
- CDKTF の TypeScript 側から値を参照したいケースでも、基本は `process.env` に設定した同じ環境変数を利用します。

## ディレクトリ概要

- `src/main.ts` : `ENVIRONMENT` と `STACK` の組み合わせに応じて CDKTF スタックを組み立てるエントリポイント
- `src/stacks/` : プロジェクト固有のスタック（Cloudflare、Google、AWS など）
- `src/constructs/` : 再利用可能な Construct 群
- `src/shared/` : 環境変数・秘密値ラッパー (`EnvironmentConfig`) などの共通ユーティリティ
- `docker/` : CDKTF 開発用コンテナの Dockerfile
- `docs/` : スタックごとの仕様や運用メモ

## 開発フロー

1. `npm install` 実行後、`npm run get` でプロバイダコードを生成
2. `ENVIRONMENT` と `STACK` を設定して `npm run plan`/`deploy`
3. 変更内容がある場合は `docs/decisions` や `docs/iac-library-split-spec.md` を更新
4. 共通化したい機能は `projects/cdktf-toolkit` 側へ移設し、`npm install` でローカル依存を反映

## 参考リンク

- [CDK for Terraform](https://developer.hashicorp.com/terraform/cdktf)
- [Terraform Registry: Cloudflare Provider](https://registry.terraform.io/providers/cloudflare/cloudflare/latest)
- `docs/decisions/0006-infrastructure-split-iac-library-and-main.md`
