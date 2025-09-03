---
applyTo: >
  .devcontainer/**/*,
  .github/**/*,
  docs/**/*,
  src/**/*,
  tests/**/*,
  .*,
---

# 開発環境

vscode の devcontainer での開発を想定しています。
本書では、それ以外の環境での開発方法については触れません。

## 初期構築

環境設定をコピー

```bash
cp .env.example .env
```

vscode 起動して、コンテナで再起動

devcontainer でターミナルを開いて、コマンドを実行します。

## コマンド

### 基本開発コマンド

```bash
npm run build          # TypeScriptコンパイル
npm run watch          # ファイル変更を監視してビルド
npm run get            # Terraformプロバイダー取得
```

### CDKTF 操作

```bash
npm run synth          # Terraform設定ファイル生成
npm run deploy         # インフラデプロイ
npm run destroy        # インフラ削除
npm run diff           # 変更差分表示
```

### テスト・品質管理

```bash
npm test               # テスト実行
npm run test:watch     # テスト監視モード
npm run test:coverage  # カバレッジレポート生成
npm run lint           # ESLintチェック
npm run lint:fix       # ESLint自動修正
npm run format         # Prettierフォーマット
npm run format:check   # フォーマットチェック
npm run pre-commit     # コミット前チェック（lint + format + test）
```

### 依存関係管理

```bash
npm run upgrade        # CDKTF関連パッケージのアップデート
```

## テスト実行

### 特定のテスト実行

```bash
npm test -- --testPathPattern=stack.test.ts
```

### カバレッジ確認

```bash
npm run test:coverage
# coverage/lcov-report/index.htmlで詳細確認
```

## アーキテクチャ

### ディレクトリ構造

- `src/` - TypeScript ソースコード
  - `main.ts` - エントリーポイント
  - `stacks/` - CDKTF スタック定義
  - `constructs/` - 再利用可能コンポーネント
- `tests/` - テストファイル
- `lib/` - ビルド済み JavaScript ファイル

### 設定ファイル

- `cdktf.json` - CDKTF 設定（OpenTofu バイナリを使用）
- `terraform.tfvars` - 環境変数設定
- `package.json` - npm 依存関係とスクリプト

### プロバイダー

- AWS Provider (`aws@~>5.0`)
- Cloudflare Provider (`cloudflare@~>4.0`)

### 重要な特徴

- OpenTofu (`tofu`) を Terraform バイナリとして使用
- TypeScript 厳格設定
- Jest + ts-jest でテスト実行
- ESLint + Prettier でコード品質管理
- VSCode DevContainer 対応

## 開発時の注意点

### テストカバレッジ

- 80%以上のカバレッジを維持
- `src/main.ts`はカバレッジから除外

### コード品質

- ESLint 設定: TypeScript 推奨ルール + Prettier 統合
- 最大行長: 120 文字
- シングルクォート使用

### Node.js Dependencies

- DevContainer では node_modules を Docker ボリュームで管理
- 依存関係変更時は `npm ci` でボリューム更新が必要
