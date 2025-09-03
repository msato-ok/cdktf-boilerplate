# 🚀 CDK for Terraform - Boilerplate

CDK for Terraform 開発環境をワンクリックで構築できるボイラープレートです。

[![CI](https://github.com/minr-dev/cdktf-boilerplate/workflows/CI/badge.svg)](https://github.com/minr-dev/cdktf-boilerplate/actions)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)](https://opensource.org/licenses/MIT)
[![CDKTF Version](https://img.shields.io/badge/CDKTF-0.19.0-blue.svg)](https://github.com/hashicorp/terraform-cdk)

## ✨ 特徴

- 🐳 **VSCode DevContainer**: ワンクリックで完全な開発環境を構築
- 🧪 **テスト統合**: Jest + カバレッジレポート + スナップショットテスト
- 📝 **コード品質**: ESLint + Prettier + TypeScript 厳格設定
- 🔄 **CI/CD**: GitHub Actions 自動テスト・デプロイ
- 🛡️ **セキュリティ**: 依存関係スキャン + 脆弱性チェック
- 📁 **構造**: スケーラブルなフォルダ構成

## 🚀 クイックスタート

### 前提条件

- [Docker](https://www.docker.com/)
- [VS Code](https://code.visualstudio.com/)
- [Dev Containers extension](https://marketplace.visualstudio.com/items?itemName=ms-vscode-remote.remote-containers)

### セットアップ

1. **リポジトリクローン**

   ```bash
   git clone https://github.com/minr-dev/cdktf-boilerplate.git
   cd cdktf-boilerplate
   ```

2. **VS Code DevContainer 起動**

   ```bash
   code .
   # Command Palette (Ctrl+Shift+P) → "Dev Containers: Reopen in Container"
   ```

3. **設定ファイル作成**

   ```bash
   cp terraform.tfvars.example terraform.tfvars
   # terraform.tfvarsを編集して実際の値を設定
   ```

4. **開発開始** 🎉
   ```bash
   npm run build         # プロジェクトビルド
   npm run synth:prod    # Terraform設定ファイル生成
   npm run deploy:prod   # インフラストラクチャデプロイ
   ```

## 📁 プロジェクト構造

```
├── .devcontainer/          # DevContainer設定
├── src/                   # ソースコード
│   ├── main.ts           # エントリーポイント
│   ├── stacks/           # CDKTFスタック
│   └── constructs/       # 再利用可能コンポーネント
├── tests/                # テストファイル
├── docs/                 # ドキュメント
└── terraform.tfvars.example  # 設定ファイルテンプレート
```

## 🛠️ 開発コマンド

```bash
# 基本操作
npm run build        # TypeScriptビルド
npm run watch        # ファイル変更を監視してビルド
npm run get          # Terraformプロバイダー取得

# CDKTF操作
npm run synth        # Terraform設定ファイル生成
npm run deploy       # インフラデプロイ
npm run destroy      # インフラ削除
npm run diff         # 変更差分表示

# テスト・品質管理
npm test             # テスト実行
npm run test:coverage # カバレッジレポート生成
npm run lint         # ESLintチェック
npm run format       # Prettierフォーマット
npm run pre-commit   # コミット前チェック
```

## 🏗️ サンプル実装

このボイラープレートには、**Cloudflare Zero Trust** を使用したセキュアな Web アプリケーション構成のサンプルが含まれています。

- Google OAuth 認証によるアクセス制御
- Cloudflare プロキシ経由の HTTPS 通信
- AWS セキュリティグループの自動管理

詳細は [サンプル実装ドキュメント](./docs/SAMPLE_DEPLOYMENT.md) を参照してください。

## 🧪 テスト

```bash
# 全テスト実行
npm test

# 特定のテストファイル実行
npm test -- --testPathPattern=stack.test.ts

# カバレッジレポート生成
npm run test:coverage
```

## 🔧 VS Code 統合

### タスク実行

- `Ctrl+Shift+P` → `Tasks: Run Task`
- CDKTF Deploy/Destroy/Synth が選択可能

### デバッグ

- `F5` でデバッグ開始
- ブレークポイント設定可能

## 🔄 CI/CD

プッシュ・プルリクエスト時に自動実行：

- ✅ ESLint + Prettier チェック
- ✅ テスト実行 + カバレッジ
- ✅ セキュリティスキャン
- ✅ CDKTF Synth 検証

## 🤝 貢献

1. フォーク
2. フィーチャーブランチ作成 (`git checkout -b feature/amazing-feature`)
3. 変更をコミット (`git commit -m 'Add amazing feature'`)
4. ブランチにプッシュ (`git push origin feature/amazing-feature`)
5. プルリクエスト作成

### 開発ガイドライン

- TypeScript の厳格モードを使用
- テストカバレッジ 80%以上を維持
- ESLint + Prettier ルールに従う
- コミット前に `npm run pre-commit` を実行

## 📚 ドキュメント

- [📊 公式テンプレートとの比較](./docs/COMPARISON.md)
- [📖 サンプル実装ガイド](./docs/SAMPLE_DEPLOYMENT.md)
- [☁️ Cloudflare インポートガイド](./docs/CLOUDFLARE_IMPORT.md)

## 🔗 関連リンク

- [CDK for Terraform 公式ドキュメント](https://developer.hashicorp.com/terraform/cdktf)
- [Cloudflare Zero Trust](https://developers.cloudflare.com/cloudflare-one/)
- [Terraform Provider Registry](https://registry.terraform.io/browse/providers)

## 📝 ライセンス

[MIT License](LICENSE) - 詳細は[LICENSE](LICENSE)ファイルを参照

## ✨ 謝辞

このボイラープレートは以下をベースに構築されています：

- [HashiCorp Terraform CDK](https://github.com/hashicorp/terraform-cdk)
- [AWS CDK best practices](https://docs.aws.amazon.com/cdk/v2/guide/best-practices.html)
- [TypeScript community standards](https://github.com/microsoft/TypeScript)
