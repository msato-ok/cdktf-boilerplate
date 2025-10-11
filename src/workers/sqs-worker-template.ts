/**
 * SQSキューイングWorkerのテンプレート (Template Method Pattern)
 *
 * このモジュールは以下の定型処理の骨格を提供します：
 * 1. CORS処理（preflight対応）
 * 2. HTTPメソッド検証
 * 3. 必須フィールドバリデーション
 * 4. メッセージ長バリデーション
 * 5. Turnstile BOT検証
 * 6. 入力データのサニタイズ（可変部分：外部から注入）
 * 7. SQSへのメッセージ送信
 * 8. エラーハンドリング
 *
 * Template Methodパターンの関数型プログラミング版として実装しています。
 * 処理フローは固定し、サニタイズ処理のみを外部から注入することで、
 * 各Workerは独自のビジネスロジックに集中できます。
 */

import {
  WorkerEnv,
  CORS_HEADERS,
  verifyTurnstile,
  sendToSqs,
  errorResponse,
  successResponse,
  corsPreflightResponse,
  validateRequiredFields,
  validateMessageLength,
} from './common';

/**
 * リクエストボディの基底型
 */
export interface SqsWorkerRequest {
  turnstileToken: string;
  [key: string]: unknown;
}

/**
 * サニタイズ後のメッセージの基底型
 */
export interface SanitizedMessage {
  timestamp: string;
  guid: string;
  [key: string]: unknown;
}

/**
 * SQS Workerテンプレートの設定
 *
 * Template Methodパターンにおける「可変部分」を定義します。
 * 固定された処理フローの中で、この設定に基づいて動作をカスタマイズします。
 */
export interface SqsWorkerConfig<TRequest extends SqsWorkerRequest> {
  /** 必須フィールド名のリスト（turnstileTokenは自動で含まれる） */
  requiredFields: string[];
  /** バリデーション対象のメッセージフィールド名 */
  messageField: string;
  /** 成功時のレスポンスメッセージ */
  successMessage: string;
  /** リクエストをサニタイズしてSQSメッセージに変換する関数（テンプレートメソッドにおける可変ステップ） */
  sanitize: (body: TRequest) => SanitizedMessage;
}

/**
 * SQSキューイングWorkerをテンプレートから作成
 *
 * Template Methodパターン：
 * - 固定部分：CORS、バリデーション、Turnstile検証、SQS送信、エラー処理
 * - 可変部分：sanitize関数（各Workerが独自のビジネスロジックを実装）
 *
 * @param config Workerの動作をカスタマイズする設定
 * @returns Cloudflare Worker互換のオブジェクト
 *
 * @example
 * ```typescript
 * // コメント投稿Workerの例
 * const worker = createSqsWorker({
 *   requiredFields: ['name', 'email', 'comment'],
 *   messageField: 'comment',
 *   successMessage: 'Comment submitted',
 *   sanitize: (body) => ({
 *     name: sanitizeString(body.name),
 *     email: sanitizeEmail(body.email),
 *     comment: sanitizeString(body.comment),
 *     timestamp: new Date().toISOString(),
 *     guid: crypto.randomUUID(),
 *   }),
 * });
 *
 * export default worker;
 * ```
 */
export function createSqsWorker<TRequest extends SqsWorkerRequest>(
  config: SqsWorkerConfig<TRequest>,
): { fetch: (request: Request, env: WorkerEnv) => Promise<Response> } {
  return {
    async fetch(request: Request, env: WorkerEnv): Promise<Response> {
      // ===== Template Method: 固定部分の開始 =====
      console.log('[Worker] Request received:', request.method, request.url);

      // 1. CORS preflight処理
      if (request.method === 'OPTIONS') {
        console.log('[Worker] CORS preflight');
        return corsPreflightResponse();
      }

      // 2. HTTPメソッド検証
      if (request.method !== 'POST') {
        console.log('[Worker] Method not allowed:', request.method);
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
        });
      }

      try {
        console.log('[Worker] Parsing request body...');
        const body = (await request.json()) as TRequest;
        console.log('[Worker] Body parsed:', Object.keys(body));

        // 3. 必須フィールドバリデーション
        console.log('[Worker] Validating required fields...');
        const allRequiredFields = [...config.requiredFields, 'turnstileToken'];
        const fieldError = validateRequiredFields(body, allRequiredFields);
        if (fieldError) {
          console.log('[Worker] Field validation error:', fieldError);
          return errorResponse(fieldError, 400);
        }

        // 4. メッセージ長バリデーション
        console.log('[Worker] Validating message length...');
        const messageValue = (body as Record<string, unknown>)[config.messageField];
        if (typeof messageValue === 'string') {
          const lengthError = validateMessageLength(messageValue);
          if (lengthError) {
            console.log('[Worker] Message length error:', lengthError);
            return errorResponse(lengthError, 400);
          }
        }

        // 5. Turnstile BOT検証
        console.log('[Worker] Verifying Turnstile token...');
        const turnstileResult = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY);
        console.log('[Worker] Turnstile result:', turnstileResult);
        if (!turnstileResult.success) {
          console.log('[Worker] Turnstile verification failed');
          return errorResponse('Bot verification failed', 400);
        }

        // ===== Template Method: 可変部分（各Workerが実装） =====
        // 6. 入力データのサニタイズ
        console.log('[Worker] Sanitizing input data...');
        const sanitizedMessage = config.sanitize(body);

        // ===== Template Method: 固定部分の再開 =====
        // メタデータの追加（sanitize関数で未設定の場合）
        if (!sanitizedMessage.timestamp) {
          sanitizedMessage.timestamp = new Date().toISOString();
        }
        if (!sanitizedMessage.guid) {
          sanitizedMessage.guid = crypto.randomUUID();
        }

        // 7. SQSへのメッセージ送信
        console.log('[Worker] Sending message to SQS...');
        await sendToSqs(sanitizedMessage, env);
        console.log('[Worker] Message sent to SQS successfully');

        console.log('[Worker] Returning success response');
        return successResponse(config.successMessage);
      } catch (error) {
        // 8. エラーハンドリング
        console.error('[Worker] Error processing request:', error);

        // JSON パースエラーやバリデーションエラーは 400 Bad Request
        if (error instanceof SyntaxError) {
          return errorResponse('Invalid JSON', 400);
        }
        if (error instanceof Error && error.message.includes('Invalid email format')) {
          return errorResponse(error.message, 400);
        }

        // その他のエラーは 500 Internal Server Error
        return errorResponse('Internal server error', 500);
      }
    },
  };
}
