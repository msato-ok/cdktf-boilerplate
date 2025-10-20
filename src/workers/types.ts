/**
 * Cloudflare Workers の ExecutionContext を必要最小限で模倣する。
 *
 * - 本来は @cloudflare/workers-types を利用するべきだが、追加依存を避けつつ
 *   waitUntil のみを利用したい要件のため軽量な型エイリアスとして定義。
 * - 将来的に公式型へ切り替える場合はここを置き換えるだけで良い。
 */
export interface ExecutionContextLike {
  waitUntil(promise: Promise<unknown>): void;
}
