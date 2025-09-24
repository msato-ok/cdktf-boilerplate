#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/deploy.sh [options]
# Options:
#   --dry-run    Plan only (no deployment)
#   --verbose    Show detailed output

show_usage() {
  echo "Usage: $0 [options]" >&2
  echo "" >&2
  echo "Deploy all stacks (AWS + Cloudflare with dependency resolution)" >&2
  echo "" >&2
  echo "Options:" >&2
  echo "  --dry-run               - Plan only (no deployment)" >&2
  echo "  --verbose               - Show detailed output" >&2
  echo "" >&2
  echo "環境変数:" >&2
  echo "  ENVIRONMENT=prod|dev" >&2
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

while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
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
npm run $NPM_SILENT clean:state || true
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

# Check required files
if [[ ! -f "terraform.${ENVIRONMENT}.tfvars" && ! -f "terraform.tfvars" ]]; then
  echo "❌ Error: terraform.${ENVIRONMENT}.tfvars or terraform.tfvars not found" >&2
  exit 1
fi

echo ""
echo "🚀 [2/2] Deployment Phase"

# 全スタックを依存関係に従ってデプロイ（CDKTFが自動解決）
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
  [[ "$VERBOSE" == "true" ]] && echo "   Command: ENVIRONMENT=$ENVIRONMENT npm run deploy"
  if ! ENVIRONMENT="$ENVIRONMENT" CI=1 npm run $NPM_SILENT deploy; then
    echo "   ❌ Error: Failed to deploy stacks" >&2
    exit 1
  fi
  echo "   ✅ Deployment completed"
fi

echo ""
if [[ "$DRY_RUN" == "true" ]]; then
  echo "✅ Planning completed successfully!"
else
  echo "🎉 Deployment completed successfully!"
fi
