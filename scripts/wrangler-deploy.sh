#!/usr/bin/env bash
set -euo pipefail

cd "$(dirname "$0")/.."
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
  echo "🔧 Loaded environment variables from .env"
fi

# TF_VAR_cloudflare_api_token を CLOUDFLARE_API_TOKEN に変換
# wrangler は CLOUDFLARE_API_TOKEN 環境変数を使用
if [[ -z "${CLOUDFLARE_API_TOKEN:-}" ]] && [[ -n "${TF_VAR_cloudflare_api_token:-}" ]]; then
  export CLOUDFLARE_API_TOKEN="${TF_VAR_cloudflare_api_token}"
  echo "🔑 Using Cloudflare API token from TF_VAR_cloudflare_api_token"
fi

# 環境ごとのwrangler.tomlファイルを使用（--env オプション不要）
npx wrangler deploy --config "wrangler.comments.${ENVIRONMENT}.toml"
npx wrangler deploy --config "wrangler.inquiry.${ENVIRONMENT}.toml"
