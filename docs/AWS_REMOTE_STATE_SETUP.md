# AWS リモートステート（S3 + DynamoDB）初期セットアップ

CDKTF のバックエンドとして Amazon S3 と DynamoDB を利用する場合、
あらかじめ以下のリソースを AWS CLI などで作成しておく必要があります。

このドキュメントでは、AWS CLI を使用してステート用 S3 バケットおよび
ロック用 DynamoDB テーブルを準備する手順をまとめています。

## 前提条件

- AWS CLI v2 以降がインストール済みで `aws configure` により
  適切な認証情報・リージョンが設定されていること
- バケット名やテーブル名はグローバル一意になる名前を利用すること
- 以下の例ではリージョン `ap-northeast-1` を使用しています。必要に応じて読み替えてください。

## 1. S3 バケットの作成

```bash
STATE_BUCKET="galileo-rent-terraform-state"
REGION="ap-northeast-1"

# バケット作成（存在しない場合のみ）
aws s3api create-bucket \
  --bucket "$STATE_BUCKET" \
  --create-bucket-configuration LocationConstraint="$REGION"

# バージョニングを有効化（誤操作時にロールバック可能にする）
aws s3api put-bucket-versioning \
  --bucket "$STATE_BUCKET" \
  --versioning-configuration Status=Enabled

# サーバー側暗号化を有効化（SSE-S3）
aws s3api put-bucket-encryption \
  --bucket "$STATE_BUCKET" \
  --server-side-encryption-configuration '{
    "Rules": [{
      "ApplyServerSideEncryptionByDefault": {"SSEAlgorithm": "AES256"}
    }]
  }'
```

> 既にバケットが存在する場合は `create-bucket` をスキップし、
> バージョニングと暗号化の設定だけ適用してください。

## 2. DynamoDB テーブルの作成

Terraform のステートロック用に、パーティションキー `LockID` を持つ
DynamoDB テーブルを作成します。

```bash
LOCK_TABLE="galileo-rent-terraform-lock"

aws dynamodb create-table \
  --table-name "$LOCK_TABLE" \
  --attribute-definitions AttributeName=LockID,AttributeType=S \
  --key-schema AttributeName=LockID,KeyType=HASH \
  --billing-mode PAY_PER_REQUEST \
  --region "$REGION"
```

> 既にテーブルが存在する場合は同名作成でエラーになるため、そのまま次へ進んで問題ありません。

## 3. CDKTF 設定への反映

作成したリソースを `main.ts` に反映します。

```ts
  // S3Backend（TerraformのステートをS3に保持）用の設定
  const stateBucket = "galileo-rent-terraform-state";
  const stateDynamodbTable = "galileo-rent-terraform-lock";
  const stateRegion = process.env.AWS_REGION || 'ap-northeast-1';
  const stateKeyPrefix = tfvars.state_key_prefix || 'galileo-rent';
```

その後、通常通り `npm run synth` や `cdktf deploy` を実行すれば、
S3 + DynamoDB バックエンドが利用されます。

## 注意事項

- バケットのバージョニングは有効化したまま運用してください。誤削除時の緊急復旧に役立ちます。
- DynamoDB テーブルは削除しない限りコストはほとんど発生しません（オンデマンド課金）。
- CI/CD で利用する場合は、実行環境からこれらのリソースへアクセスできるよう IAM 権限を設定してください。
