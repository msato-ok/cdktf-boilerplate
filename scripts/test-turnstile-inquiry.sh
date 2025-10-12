#!/bin/bash
set -euo pipefail

# Turnstile テストHTMLファイルを生成してS3にデプロイする（問い合わせフォーム向け）
#
# Turnstile は file:// プロトコルでは動作せず、登録ドメインと一致しないとエラーになる。
# そのため静的サイトの S3 バケットにアップロードしてブラウザから確認する。
# テスト完了後は手動で削除する想定。

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

TEST_HTML_FILE="test-turnstile-inquiry.html"
STATIC_SITE_FQDN="${STATIC_SITE_SUBDOMAIN}.${STATIC_SITE_DOMAIN}"
STATIC_API_FQDN="${STATIC_API_SUBDOMAIN}.${STATIC_SITE_DOMAIN}"
QUEUE_NAME="wp-inquiry-${ENVIRONMENT}"
WRANGLER_CONFIG="wrangler.inquiry.${ENVIRONMENT}.toml"

# TURNSTILE_SITE_KEY が未設定なら終了
if [[ -z "${TURNSTILE_SITE_KEY:-}" ]]; then
  echo "エラー: TURNSTILE_SITE_KEY 環境変数が設定されていません" >&2
  echo ""
  echo "使用方法: TURNSTILE_SITE_KEY=<your-site-key> $0" >&2
  echo ""
  echo "TURNSTILE_SITE_KEY は ./scripts/get-turnstile-keys.sh で取得してください" >&2
  exit 1
fi

cat > "$TEST_HTML_FILE" << EOF
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Turnstile Inquiry Test</title>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body>
  <h1>問い合わせフォーム Turnstile テスト</h1>
  <form id="inquiry-form">
    <div>
      <label>名前: <input type="text" name="name" required></label>
    </div>
    <div>
      <label>会社名: <input type="text" name="company"></label>
    </div>
    <div>
      <label>メール: <input type="email" name="email" required></label>
    </div>
    <div>
      <label>内容: <textarea name="message" required></textarea></label>
    </div>
    <div>
      <!-- Turnstile ウィジェット -->
      <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>
    </div>
    <button type="submit">送信</button>
  </form>

  <div id="result"></div>

  <script>
    document.getElementById('inquiry-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(e.target);
      const turnstileToken = document.querySelector('[name="cf-turnstile-response"]').value;

      const data = {
        turnstileToken: turnstileToken,
        name: formData.get('name'),
        company: formData.get('company'),
        email: formData.get('email'),
        message: formData.get('message')
      };

      try {
        const response = await fetch('https://${STATIC_API_FQDN}/inquiry', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(data)
        });

        const result = await response.json();
        document.getElementById('result').innerHTML =
          '<pre>' + JSON.stringify(result, null, 2) + '</pre>';
      } catch (error) {
        document.getElementById('result').innerHTML =
          '<pre>Error: ' + error.message + '</pre>';
      }
    });
  </script>
</body>
</html>
EOF

aws s3 cp "$TEST_HTML_FILE" "s3://${STATIC_SITE_BUCKET_NAME}/$TEST_HTML_FILE"
cat << EOF
# S3 に $TEST_HTML_FILE をデプロイしました。

# 次のステップ:
## (1) Worker のログを確認：
npx wrangler tail --config "$WRANGLER_CONFIG"

## (2) ブラウザで以下にアクセスして送信：
https://${STATIC_SITE_FQDN}/$TEST_HTML_FILE

## (3) SQS メッセージを確認：
aws sqs receive-message \\
  --queue-url https://sqs.ap-northeast-1.amazonaws.com/${TF_VAR_aws_account_id}/${QUEUE_NAME} \\
  --region ${AWS_REGION} \\
  --max-number-of-messages 1 \\
  --visibility-timeout 10 \\
  --wait-time-seconds 0

## (4) テスト終了後、以下のコマンドで削除してください：
aws s3 rm "s3://${STATIC_SITE_BUCKET_NAME}/$TEST_HTML_FILE"

EOF
