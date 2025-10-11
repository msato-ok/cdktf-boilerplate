
#!/bin/bash
set -euo pipefail

# Turnstile テストHTMLファイルを生成してS3にデプロイする
# 
# Turnstile は file:// プロトコルでは動作しない、ドメインも一致していないとエラーになるため
# S3にアップロードして確認する
# テスト後は、手動で削除することを想定する
#

cd "$(dirname "$0")/.."

if [[ -f .env ]]; then
  set -a; source .env; set +a
fi

OUTPUT_FILE="test-turnstile-comments.html"
STATIC_SITE_FQDN="${STATIC_SITE_SUBDOMAIN}.${STATIC_SITE_DOMAIN}"
STATIC_API_FQDN="${STATIC_API_SUBDOMAIN}.${STATIC_SITE_DOMAIN}"

# TURNSTILE_SITE_KEYが未設定の場合はエラー
if [[ -z "${TURNSTILE_SITE_KEY:-}" ]]; then
  echo "エラー: TURNSTILE_SITE_KEY環境変数が設定されていません" >&2
  echo "使用方法: TURNSTILE_SITE_KEY=<your-site-key> $0 [出力ファイル名]" >&2
  echo "TURNSTILE_SITE_KEYは ./scripts/get-turnstile-keys.sh を実行して取得してください" >&2
  exit 1
fi

cat > "$OUTPUT_FILE" << EOF
<!DOCTYPE html>
<html lang="ja">
<head>
  <meta charset="UTF-8">
  <title>Turnstile Test</title>
  <script src="https://challenges.cloudflare.com/turnstile/v0/api.js" async defer></script>
</head>
<body>
  <h1>Turnstile テスト</h1>
  <form id="comment-form">
    <div>
      <label>名前: <input type="text" name="name" required></label>
    </div>
    <div>
      <label>メール: <input type="email" name="email" required></label>
    </div>
    <div>
      <label>コメント: <textarea name="comment" required></textarea></label>
    </div>
    <div>
      <!-- Turnstile ウィジェット -->
      <!-- Site Key を実際の値に置き換えてください -->
      <div class="cf-turnstile" data-sitekey="${TURNSTILE_SITE_KEY}"></div>
    </div>
    <button type="submit">送信</button>
  </form>

  <div id="result"></div>

  <script>
    document.getElementById('comment-form').addEventListener('submit', async (e) => {
      e.preventDefault();

      const formData = new FormData(e.target);
      const turnstileToken = document.querySelector('[name="cf-turnstile-response"]').value;

      const data = {
        turnstileToken: turnstileToken,
        name: formData.get('name'),
        email: formData.get('email'),
        comment: formData.get('comment'),
        postId: '123'
      };

      try {
        const response = await fetch('https://${STATIC_API_FQDN}/comments', {
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

aws s3 cp "$OUTPUT_FILE" "s3://${STATIC_SITE_BUCKET_NAME}/$OUTPUT_FILE"
echo "S3 に $OUTPUT_FILE をデプロイしました。"
echo ""
echo "ブラウザで以下にアクセス："
echo "  https://${STATIC_SITE_FQDN}/$OUTPUT_FILE"
echo ""
echo "テスト終了後、以下のコマンドで削除してください："
echo "  aws s3 rm \"s3://${STATIC_SITE_BUCKET_NAME}/$OUTPUT_FILE\""
echo ""
