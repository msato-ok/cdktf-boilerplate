---
applyTo: >
  .devcontainer/**/*,
  .github/**/*,
  docs/**/*,
  src/**/*,
  tests/**/*,
  .*,
---

# プロジェクト概要

CDK for Terraform (CDKTF) を使用したインフラストラクチャ管理プロジェクトのボイラープレートです。
TypeScript で記述され、AWS や Cloudflare などのクラウドを管理することを目的としています。

## ボイラープレートとしてのサンプル実装

Cloudflare で管理しているドメイン（example.com）を使用して、ゼロトラストセキュリティを設定します。

- サブドメイン app.example.com を作成し、https トラフィックを対象 IP にプロキシーする
- 同サブドメインへのアクセスを、Google 認証で許可されたドメインユーザーのみに制限する
- Cloudflare がアクセス元となるときの IP アドレスを調べる
- 対象 IP 側では、Cloudflare からのアクセスのみ許可するようにする
