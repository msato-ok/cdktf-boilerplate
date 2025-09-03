#!/usr/bin/env bash
set -euo pipefail

# Usage:
#   scripts/cdktf-reset-and-deploy.sh <prod|dev> <cloudflare|google|aws-sg-enforce-inline|all> [options]
# Options:
#   --dry-run    Plan only (no deployment)
#   --skip-plan  Skip plan step (deploy directly)
#   --verbose    Show detailed output

show_usage() {
  echo "Usage: $0 <prod|dev> <stack> [options]" >&2
  echo "" >&2
  echo "Environments:" >&2
  echo "  prod|dev" >&2
  echo "" >&2
  echo "Stacks:" >&2
  echo "  cloudflare              - Deploy Cloudflare Zero Trust Access" >&2
  echo "  google                  - Generate OAuth setup checklist (no deploy)" >&2
  echo "  aws-sg-enforce-inline   - Deploy AWS Security Group rules" >&2
  echo "  all                     - Process all stacks" >&2
  echo "" >&2
  echo "Options:" >&2
  echo "  --dry-run               - Plan only (no deployment)" >&2
  echo "  --skip-plan             - Skip plan step (deploy directly)" >&2
  echo "  --verbose               - Show detailed output" >&2
}

ENVIRONMENT="${1:-}"
STACKS_ARG="${2:-}"
DRY_RUN=false
SKIP_PLAN=false
VERBOSE=false

# Parse options
shift 2 2>/dev/null || true
while [[ $# -gt 0 ]]; do
  case $1 in
    --dry-run) DRY_RUN=true; shift ;;
    --skip-plan) SKIP_PLAN=true; shift ;;
    --verbose) VERBOSE=true; shift ;;
    --help|-h) show_usage; exit 0 ;;
    *) echo "Unknown option: $1" >&2; show_usage; exit 1 ;;
  esac
done

# Validate arguments
if [[ -z "$ENVIRONMENT" || -z "$STACKS_ARG" ]]; then
  show_usage
  exit 1
fi

case "$ENVIRONMENT" in
  prod|dev) ;;
  *) echo "Error: Invalid environment '$ENVIRONMENT'" >&2; show_usage; exit 1;;
esac

case "$STACKS_ARG" in
  all) STACKS=(google cloudflare aws-sg-enforce-inline) ;;
  cloudflare) STACKS=(cloudflare) ;;
  google) STACKS=(google) ;;
  aws-sg-enforce-inline) STACKS=(aws-sg-enforce-inline) ;;
  *) echo "Error: Invalid stack '$STACKS_ARG'" >&2; show_usage; exit 1;;
esac

# Set npm output level
NPM_SILENT="--silent"
if [[ "$VERBOSE" == "true" ]]; then
  NPM_SILENT=""
fi

echo "🚀 CDKTF Deployment Script"
echo "   Environment: ${ENVIRONMENT}"
echo "   Stacks: ${STACKS[*]}"
echo "   Mode: $($DRY_RUN && echo "DRY-RUN (plan only)" || echo "FULL (plan + deploy)")"
echo ""

echo "📋 [1/3] Cleanup & Preparation"
npm run $NPM_SILENT clean:state || true
npm run $NPM_SILENT get

# Check required files
if [[ ! -f "terraform.${ENVIRONMENT}.tfvars" && ! -f "terraform.tfvars" ]]; then
  echo "❌ Error: terraform.${ENVIRONMENT}.tfvars or terraform.tfvars not found" >&2
  exit 1
fi

echo ""
echo "🔍 [2/3] Planning Phase"
for stack in "${STACKS[@]}"; do
  echo "   Planning: $stack"
  if [[ "$VERBOSE" == "true" ]]; then
    echo "   Command: STACK=$stack ENVIRONMENT=$ENVIRONMENT npm run plan:${ENVIRONMENT}"
  fi
  STACK="$stack" ENVIRONMENT="$ENVIRONMENT" npm run $NPM_SILENT plan:${ENVIRONMENT}
done

if [[ "$DRY_RUN" == "true" ]]; then
  echo ""
  echo "✅ Dry-run completed. No resources were deployed."
  echo "   Remove --dry-run flag to proceed with actual deployment."
  exit 0
fi

echo ""
echo "🚀 [3/3] Deployment Phase"
for stack in "${STACKS[@]}"; do
  if [[ "$stack" == "google" ]]; then
    echo "   Processing: $stack (checklist generation only)"
  else
    echo "   Deploying: $stack"
  fi
  
  if [[ "$SKIP_PLAN" == "false" ]]; then
    if [[ "$VERBOSE" == "true" ]]; then
      echo "   Command: STACK=$stack ENVIRONMENT=$ENVIRONMENT npm run deploy:${ENVIRONMENT}"
    fi
  fi
  
  STACK="$stack" ENVIRONMENT="$ENVIRONMENT" CI=1 npm run $NPM_SILENT deploy:${ENVIRONMENT}
  
  # Special handling for Google stack
  if [[ "$stack" == "google" ]]; then
    echo "   ✅ OAuth checklist generated: oauth-checklist-${ENVIRONMENT}.md"
  else
    echo "   ✅ Deployed successfully"
  fi
done

echo ""
echo "🎉 All operations completed successfully!"
echo ""
echo "📋 Next steps:"
case "$STACKS_ARG" in
  google|all)
    echo "   • Review oauth-checklist-${ENVIRONMENT}.md for OAuth setup"
    ;;
esac
case "$STACKS_ARG" in
  cloudflare|all)
    echo "   • Test Cloudflare Zero Trust Access"
    ;;
esac
case "$STACKS_ARG" in
  aws-sg-enforce-inline|all)
    echo "   • Verify AWS Security Group rules"
    ;;
esac
