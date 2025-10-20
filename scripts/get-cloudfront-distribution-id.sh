#!/usr/bin/env bash
set -euo pipefail

# 静的サイト用 CloudFront Distribution ID を取得するスクリプト
#
# 前提条件:
#   - `.env` に ENVIRONMENT (dev / prod) が設定されている
#   - 静的サイトフロー (static-content-stack) がデプロイ済み
#   - Terraform CLI が利用可能
#
# 使い方:
#   ./scripts/get-cloudfront-distribution-id.sh
#
# 例:
#   $ ./scripts/get-cloudfront-distribution-id.sh
#   E123ABCDEF4567

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

STACK_PATH="cdktf.out/stacks/static-content-stack"
if [[ ! -d "$STACK_PATH" ]]; then
  echo "ℹ️  static-content-stack の合成データがありません。cdktf.out を生成します..." >&2
  npm run synth:quiet >/dev/null
fi

cd "$STACK_PATH"

terraform init -input=false >/dev/null 2>&1 || {
  echo "❌ terraform init failed" >&2
  exit 1
}

if ! terraform state list >/dev/null 2>&1; then
  echo "❌ Static content stack has not been deployed yet. 静的サイト (static-site) をデプロイしてください。" >&2
  exit 1
fi

OUTPUT_NAME="cloudfront_distribution_id"

if ! terraform output -json | jq -e ".[\"${OUTPUT_NAME}\"]" >/dev/null 2>&1; then
  echo "❌ Terraform output '${OUTPUT_NAME}' が見つかりません" >&2
  exit 1
fi

terraform output -raw "$OUTPUT_NAME"
