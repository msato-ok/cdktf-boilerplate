# Cloudflare Access 既存リソースの自動取り込み（設計）

## 目的

Terraform/Tofu は Cloudflare Access アプリに対して「既存実体との同期」をサポートしていません。すでに存在する Access アプリや DNS レコードを、そのまま plan/apply で安全に管理下へ取り込むことはできません。

このため、本リポジトリでは synth 直後に既存実体を Terraform state に import し、以後の plan/apply を state ベースで一元管理します。

副次効果として、既存実体と state の ID 不一致に起因する apply 失敗も防止されます。

## いつ・どこで実行するか

- `STACK=cloudflare` のとき、`src/main.ts` が `app.synth()` の直後に `runCfAutoImport()` を実行します。
- import が失敗した場合は非ゼロ終了し、以降の処理へは進みません（明示的に失敗とする設計）。

## 同期アルゴリズム概要

1. tfvars（`cloudflare_account_id`, `domain_name`, `subdomain_name`, `cloudflare_api_token` など）を読み込み。
2. `cdktf.out/stacks/cloudflare/cdk.tf.json` を参照して、対象リソースの Terraform アドレスを特定。
3. Access アプリの特定:
   - 前提: アプリケーション URL はサブドメイン（`<subdomain>.<domain>`）で一意。
   - Cloudflare API: `GET /accounts/{accountId}/access/apps?domain=<subdomain.domain>`
   - 結果を URL 完全一致でフィルタし、対象アプリ `id` を確定。
4. すでに state 管理下かを判定（`tofu state list`/`tofu state pull`）。
   - state に存在するが、Cloudflare 側で実体が消えている場合は `tofu state rm` で除去。
   - 未管理なら `tofu import <addr> <import-id>` を実行（Access: `accounts/{accountId}/{appId}`）。
5. DNS レコードの特定と取り込み:
   - ゾーン ID の取得: `GET /zones?name=<domain>&status=active`
   - レコード検索: `GET /zones/{zoneId}/dns_records?type=A&name=<subdomain.domain>`
   - 手順 4 と同様に state と実体の整合性を取り、必要なら import。

## バイナリと実行

- 使用バイナリは OpenTofu（`tofu`）を固定で使用します。
- import 実行は TypeScript から直接呼び出し（プロセス分離なし）。

## 入力

- `terraform.<ENV>.tfvars` に以下のキーを含めます:
  - `cloudflare_api_token`
  - `cloudflare_account_id`
  - `domain_name`
  - `subdomain_name`
  - その他、スタックで必要となる可変値（例: `google_client_id` など）

## 注意事項

- URL 完全一致で Access アプリを特定するため、サブドメインの重複がないことが前提です。
- import は synth 直後に行われるため、`cdk.tf.json` と state の整合性が常に更新されます。
- エラーは synth を失敗させます。CI では早期に失敗を検知できます。
