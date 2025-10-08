#!/usr/bin/env bash
set -euo pipefail

# デバッグ用：全スタックのロックを強制解除
# 使用方法: ./scripts/unlock-all-stacks.sh

cd "$(dirname "$0")/.."

STACKS_DIR="cdktf.out/stacks"

if [[ ! -d "$STACKS_DIR" ]]; then
  echo "❌ Error: $STACKS_DIR not found. Run 'npm run synth' first."
  exit 1
fi

echo "🔓 Unlocking all stacks..."
echo ""

UNLOCKED_COUNT=0
NO_LOCK_COUNT=0
ERROR_COUNT=0

cd "$STACKS_DIR"

for stack_dir in */; do
  stack_name="${stack_dir%/}"
  echo "[DEBUG] Processing: $stack_name" >&2
  echo -n "  $stack_name: "

  if [[ ! -d "$stack_name" ]]; then
    echo "SKIP (not a directory)"
    echo "[DEBUG] Skipped (not a directory)" >&2
    continue
  fi

  cd "$stack_name"
  echo "[DEBUG] Changed to directory: $(pwd)" >&2

  # terraform planを実行してロック状態を確認
  echo "[DEBUG] Running terraform plan..." >&2
  lock_error=$(terraform plan 2>&1 || true)
  echo "[DEBUG] Terraform plan completed" >&2

  if echo "$lock_error" | grep -q "Error acquiring the state lock"; then
    echo "[DEBUG] Lock detected" >&2
    # ロックIDを抽出（色コードを除去してから抽出）
    lock_id=$(echo "$lock_error" | sed 's/\x1b\[[0-9;]*m//g' | grep -v "RequestID" | grep "ID:" | awk '{print $3}')
    echo "[DEBUG] Extracted lock ID: $lock_id" >&2

    if [[ -n "$lock_id" ]]; then
      # ロックを強制解除
      echo "[DEBUG] Attempting to unlock..." >&2
      if terraform force-unlock -force "$lock_id" >/dev/null 2>&1; then
        echo "🔓 UNLOCKED (ID: ${lock_id:0:8}...)"
        UNLOCKED_COUNT=$((UNLOCKED_COUNT + 1))
        echo "[DEBUG] Successfully unlocked" >&2
      else
        echo "❌ FAILED to unlock (ID: ${lock_id:0:8}...)"
        ERROR_COUNT=$((ERROR_COUNT + 1))
        echo "[DEBUG] Failed to unlock" >&2
      fi
    else
      echo "❌ FAILED to extract lock ID"
      ERROR_COUNT=$((ERROR_COUNT + 1))
      echo "[DEBUG] Lock ID extraction failed" >&2
    fi
  else
    echo "✓ No lock"
    NO_LOCK_COUNT=$((NO_LOCK_COUNT + 1))
    echo "[DEBUG] No lock found" >&2
  fi

  cd ..
  echo "[DEBUG] Back to stacks directory" >&2
done

cd ../..

echo ""
echo "📊 Summary:"
echo "  Unlocked:   $UNLOCKED_COUNT"
echo "  No lock:    $NO_LOCK_COUNT"
echo "  Errors:     $ERROR_COUNT"
echo ""

if [[ $ERROR_COUNT -gt 0 ]]; then
  echo "⚠️  Some stacks failed to unlock. Please check manually."
  exit 1
fi

if [[ $UNLOCKED_COUNT -gt 0 ]]; then
  echo "✅ Successfully unlocked $UNLOCKED_COUNT stack(s)"
else
  echo "✅ All stacks are already unlocked"
fi
