#!/usr/bin/env bash
#
# SSM Parameter Store への保存スクリプト
#
set -euo pipefail

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

# 必須変数
required_vars=(
    "ENVIRONMENT"
    "AWS_REGION"
    "AWS_ACCESS_KEY_ID"
    "AWS_SECRET_ACCESS_KEY"
    "SLACK_WEBHOOK_URL"
)

echo "✅ 必須環境変数を検証中..."
for var in "${required_vars[@]}"; do
    if [[ -z "${!var:-}" ]]; then
        echo "❌ Error: $var is not set in .env"
        exit 1
    fi
done

PARAM_NAME="/galileo-rent-${ENVIRONMENT}/slack-webhook-url"

# SSM Parameter Store に保存（SecureString で暗号化保存）
aws ssm put-parameter \
  --name "$PARAM_NAME" \
  --value "$SLACK_WEBHOOK_URL" \
  --type SecureString \
  --region ${AWS_REGION}

echo "✅ Slack Webhook URL を SSM Parameter Store に保存しました: $PARAM_NAME"
