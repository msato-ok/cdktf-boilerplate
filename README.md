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

1. **依存ディレクトリの配置**
   - モノレポ利用時は `projects/cdktf-toolkit` が既に存在します。
   - `galileo-wp-iac` を単独利用する場合は、同階層に `cdktf-toolkit` をクローンまたはサブモジュールとして配置してください。

     ```bash
     git clone git@github.com:your-org/cdktf-toolkit.git ../cdktf-toolkit
     ```

2. **Docker 環境変数の設定**
   - `.env.example` を参考に `projects/galileo-wp-iac/.env` を作成し、AWS や Cloudflare の資格情報を記載します。

3. **tfvars ファイルの作成**
   - `terraform.tfvars.example` をコピーし、環境ごとの値を設定します。

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

## ディレクトリ概要

- `src/main.ts` : `ENVIRONMENT` と `STACK` の組み合わせに応じて CDKTF スタックを組み立てるエントリポイント
- `src/stacks/` : プロジェクト固有のスタック（Cloudflare、Google、AWS など）
- `src/constructs/` : 再利用可能な Construct 群
- `src/shared/` : tfvars ローダーや環境変数検証ヘルパー
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
