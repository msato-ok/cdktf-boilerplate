#!/usr/bin/env bash
set -euo pipefail

# Turnstile のサイトキーとシークレットキーを取得するスクリプト
#
# 前提条件:
#   - .env に ENVIRONMENT が設定されている (prod または dev)
#   - Turnstile stack がデプロイ済み (npm run deploy)
#   - terraform / tofu コマンドが利用可能
#
# 使い方:
#   ./scripts/get-turnstile-keys.sh
#
# トラブルシュート:
#   - "ENVIRONMENT not set" エラー → .env に ENVIRONMENT=prod を設定
#   - "Turnstile stack has not been deployed" エラー → deploy.sh を実行
#   - "Could not retrieve" エラー → terraform output で利用可能な output 名を確認

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

[[ -z "${ENVIRONMENT:-}" ]] && { echo "❌ ENVIRONMENT not set"; exit 1; }

TURNSTILE_ID="galileo-rent-turnstile-${ENVIRONMENT}"

[[ ! -d "cdktf.out/stacks/turnstile-stack" ]] && npm run synth:quiet

cd cdktf.out/stacks/turnstile-stack

terraform init > /dev/null 2>&1 || { echo "❌ terraform init failed"; exit 1; }

terraform state list > /dev/null 2>&1 || { echo "❌ Turnstile stack has not been deployed yet"; exit 1; }

echo "🔑 Turnstile Keys (${ENVIRONMENT}):"
echo ""
echo "Site Key (フロントエンド用):"
terraform output -raw "${TURNSTILE_ID}_turnstile_sitekey" || { echo "❌ Failed. Run: terraform output"; exit 1; }
echo ""
echo ""
echo "Secret Key (バックエンド用、Workers に自動設定済み):"
terraform output -raw "${TURNSTILE_ID}_turnstile_secret" || { echo "❌ Failed"; exit 1; }
echo ""
