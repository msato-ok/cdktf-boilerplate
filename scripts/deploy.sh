#!/usr/bin/env bash
set -euo pipefail

# Change to the project directory and source .env
cd "$(dirname "$0")/.."
if [[ -f .env ]]; then
  set -a
  source .env
  set +a
  echo "🔧 Loaded environment variables from .env"
fi

# Usage:
#   scripts/deploy.sh [options]
# Options:
#   --dry-run      Plan only (no deployment)
#   --verbose      Show detailed output
#   --serial       Force Terraform parallelism to 1
#   --clean        Run npm run clean:state before deploying

show_usage() {
  echo "Usage: $0 [options]" >&2
  echo "" >&2
  echo "Deploy all stacks (CDKTF + Cloudflare Workers)" >&2
  echo "" >&2
  echo "Options:" >&2
  echo "  --dry-run               - Plan only (no deployment)" >&2
  echo "  --verbose               - Show detailed output" >&2
  echo "  --serial                - Force Terraform parallelism to 1 (deploy only)" >&2
  echo "  --clean                 - Clean CDKTF state/cache before preparation" >&2
  echo "" >&2
  echo "環境変数:" >&2
  echo "  ENVIRONMENT=prod|dev" >&2
  echo "" >&2
  echo "デプロイフロー:" >&2
  echo "  1. CDKTF準備（cleanup, get, build）" >&2
  echo "  2. CDKTFデプロイ（AWS + Cloudflare DNS）" >&2
  echo "  3. Workersデプロイ（Wrangler）" >&2
  echo "" >&2
}

uses_local_toolkit_dependency() {
  # package.json が "file:../cdktf-toolkit" を参照している場合はローカルビルドが必要
  if grep -Eq '"@minr-dev/cdktf-toolkit"[[:space:]]*:[[:space:]]*"file:\.\./cdktf-toolkit"' package.json 2>/dev/null; then
    return 0
  fi
  return 1
}
DRY_RUN=false
VERBOSE=false
SERIAL=false
CLEAN=false

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
    --serial) SERIAL=true; shift ;;
    --clean) CLEAN=true; shift ;;
    --help|-h) show_usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; show_usage; exit 1 ;;
  esac
done

case "$ENVIRONMENT" in
  prod|dev) ;;
  *) echo "Error: Invalid environment '$ENVIRONMENT'" >&2; show_usage; exit 1;;
esac

NPM_SILENT="--silent"
[[ "$VERBOSE" == "true" ]] && NPM_SILENT=""

echo "🚀 CDKTF Deployment Script"
echo "   Environment: ${ENVIRONMENT}"
echo "   Target: All stacks (AWS + Cloudflare)"
if [[ "$DRY_RUN" == "true" ]]; then
  echo "   Mode: DRY-RUN (plan only)"
else
  echo "   Mode: DEPLOY"
fi
echo ""

echo "📋 [1/2] Cleanup & Preparation"
if [[ "$CLEAN" == "true" ]]; then
  npm run $NPM_SILENT clean:state || true
else
  [[ "$VERBOSE" == "true" ]] && echo "   Skipping npm run clean:state (use --clean to force)"
fi
npm run $NPM_SILENT get

if uses_local_toolkit_dependency; then
  local_toolkit_path="../cdktf-toolkit"
  echo "   ローカル @minr-dev/cdktf-toolkit をビルドします"
  if [[ ! -d "$local_toolkit_path" ]]; then
    echo "❌ Error: $local_toolkit_path が見つかりません" >&2
    exit 1
  fi
  [[ "$VERBOSE" == "true" ]] && echo "   Command: (cd $local_toolkit_path && npm run build)"
  (
    cd "$local_toolkit_path"
    npm run $NPM_SILENT build
  )
fi

echo ""
echo "🚀 [2/3] CDKTF Deployment Phase"

# 全スタックを依存関係に従ってデプロイ（CDKTFが自動解決）
PARALLELISM_ARGS=()
if [[ "$SERIAL" == "true" ]]; then
  PARALLELISM_ARGS+=("--parallelism=1")
fi

if [[ "$DRY_RUN" == "true" ]]; then
  echo "   Planning all stacks..."
  [[ "$VERBOSE" == "true" ]] && echo "   Command: ENVIRONMENT=$ENVIRONMENT npm run plan"
  if ! ENVIRONMENT="$ENVIRONMENT" npm run $NPM_SILENT plan; then
    echo "   ❌ Error: Failed to plan stacks" >&2
    exit 1
  fi
  echo "   ✅ Planning completed"
else
  echo "   Deploying all stacks..."
  [[ "$VERBOSE" == "true" ]] && echo "   Command: ENVIRONMENT=$ENVIRONMENT npm run deploy -- ${PARALLELISM_ARGS[*]}"
  if ! ENVIRONMENT="$ENVIRONMENT" CI=1 npm run $NPM_SILENT deploy -- "${PARALLELISM_ARGS[@]}"; then
    echo "   ❌ Error: Failed to deploy stacks" >&2
    exit 1
  fi
  echo "   ✅ CDKTF deployment completed"
fi

echo ""
echo "☁️  [3/3] Cloudflare Workers Deployment Phase"

if [[ "$DRY_RUN" == "true" ]]; then
  echo "   Skipping Workers deployment (dry-run mode)"
else
  echo "   Deploying Workers to ${ENVIRONMENT}..."

  # Wrangler設定ファイルの存在確認（環境ごとのファイル名）
  if [[ ! -f "wrangler.comments.${ENVIRONMENT}.toml" ]] || [[ ! -f "wrangler.inquiry.${ENVIRONMENT}.toml" ]]; then
    echo "   ⚠️  Warning: wrangler.toml files not found for ${ENVIRONMENT}. Run 'ENVIRONMENT=${ENVIRONMENT} npm run synth' to generate them."
    echo "   Skipping Workers deployment."
  else
    # Workerをデプロイ（環境変数ENVIRONMENTを使用）
    [[ "$VERBOSE" == "true" ]] && echo "   Command: ENVIRONMENT=$ENVIRONMENT npm run worker:deploy"
    if ! ENVIRONMENT="$ENVIRONMENT" npm run $NPM_SILENT worker:deploy; then
      echo "   ❌ Error: Failed to deploy Workers" >&2
      exit 1
    fi
    echo "   ✅ Workers deployment completed"
  fi
fi

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
  echo "✅ Planning completed successfully!"
else
  echo "🎉 Deployment completed successfully!"
  echo ""
  echo "次のステップ:"
  echo "  1. Workerログを確認:"
  echo "     ENVIRONMENT=${ENVIRONMENT} npm run worker:tail:comments"
  echo "     ENVIRONMENT=${ENVIRONMENT} npm run worker:tail:inquiry"
fi
