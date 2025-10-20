#!/usr/bin/env bash
set -euo pipefail

# Worker 通知 SQS キューの URL を取得するスクリプト
#
# 前提条件:
#   - `.env` に ENVIRONMENT (dev / prod) が設定されている
#   - Jamstack API フロー (queue-stack) がデプロイ済み
#   - Terraform CLI が利用可能
#
# 使い方:
#   ./scripts/get-notification-queue-url.sh
#
# 例:
#   $ ./scripts/get-notification-queue-url.sh
#   https://sqs.ap-northeast-1.amazonaws.com/123456789012/wp-worker-notification-dev

ROOT_DIR="$(cd "$(dirname "$0")/.." && pwd)"
cd "$ROOT_DIR"

if [[ -f .env ]]; then
  set -a
  source .env
  set +a
fi

ENVIRONMENT="${ENVIRONMENT:-}"

if [[ -z "$ENVIRONMENT" ]]; then
  echo "❌ ENVIRONMENT not set (.env に ENVIRONMENT=dev などを追加してください)" >&2
  exit 1
fi

# TF_VAR_cloudflare_api_token を CLOUDFLARE_API_TOKEN に変換
# wrangler は CLOUDFLARE_API_TOKEN 環境変数を使用
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]] && [[ -n "${TF_VAR_cloudflare_api_token:-}" ]]; then
  export CLOUDFLARE_API_TOKEN="${TF_VAR_cloudflare_api_token}"
  echo "🔑 Using Cloudflare API token from TF_VAR_cloudflare_api_token"
fi

STACK_PATH="cdktf.out/stacks/queue-stack"
if [[ ! -d "$STACK_PATH" ]]; then
  echo "ℹ️  queue-stack の合成データがありません。cdktf.out を生成します..." >&2
  npm run synth:quiet >/dev/null
fi

cd "$STACK_PATH"

terraform init -input=false >/dev/null 2>&1 || {
  echo "❌ terraform init failed" >&2
  exit 1
}

if ! terraform state list >/dev/null 2>&1; then
  echo "❌ Queue stack has not been deployed yet. Jamstack API をデプロイしてください。" >&2
  exit 1
fi

OUTPUT_NAME="queue_wp_worker_notification_${ENVIRONMENT}_url"

if ! terraform output -json | jq -e ".[\"${OUTPUT_NAME}\"]" >/dev/null 2>&1; then
  echo "❌ Terraform output '${OUTPUT_NAME}' が見つかりません" >&2
  exit 1
fi

terraform output -raw "$OUTPUT_NAME"
echo ""
