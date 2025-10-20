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
import { createWorkerLogger } from './logger';
import { stringifyError } from './error-utils';
import type { ExecutionContextLike } from './types';

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
  /** ログ出力およびメトリクス集計で利用する Worker 名 */
  workerName: string;
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
): { fetch: (request: Request, env: WorkerEnv, executionCtx?: ExecutionContextLike) => Promise<Response> } {
  return {
    async fetch(request: Request, env: WorkerEnv, executionCtx?: ExecutionContextLike): Promise<Response> {
      const logger = createWorkerLogger(config.workerName, env, executionCtx);

      // ===== Template Method: 固定部分の開始 =====
      logger.debug('Request received', { method: request.method, url: request.url });

      // 1. CORS preflight処理
      if (request.method === 'OPTIONS') {
        logger.debug('CORS preflight request');
        return corsPreflightResponse();
      }

      // 2. HTTPメソッド検証
      if (request.method !== 'POST') {
        logger.warn('Method not allowed', { method: request.method });
        return new Response('Method Not Allowed', {
          status: 405,
          headers: { ...CORS_HEADERS, 'Cache-Control': 'no-store' },
        });
      }

      try {
        logger.debug('Parsing request body');
        const body = (await request.json()) as TRequest;
        logger.debug('Request body parsed', { keys: Object.keys(body) });

        // 3. 必須フィールドバリデーション
        logger.debug('Validating required fields');
        const allRequiredFields = [...config.requiredFields, 'turnstileToken'];
        const fieldError = validateRequiredFields(body, allRequiredFields);
        if (fieldError) {
          logger.warn('Field validation error', { reason: fieldError });
          return errorResponse(fieldError, 400);
        }

        // 4. Turnstile BOT検証
        logger.debug('Verifying Turnstile token');
        const turnstileResult = await verifyTurnstile(body.turnstileToken, env.TURNSTILE_SECRET_KEY, logger);
        logger.debug('Turnstile verification completed', turnstileResult);
        if (!turnstileResult.success) {
          logger.warn('Turnstile verification failed');
          return errorResponse('Bot verification failed', 400);
        }

        // 5. メッセージ長バリデーション
        logger.debug('Validating message length');
        const messageValue = (body as Record<string, unknown>)[config.messageField];
        if (typeof messageValue === 'string') {
          const lengthError = validateMessageLength(messageValue);
          if (lengthError) {
            logger.warn('Message length validation error', { reason: lengthError });
            return errorResponse(lengthError, 400);
          }
        }

        // ===== Template Method: 可変部分（各Workerが実装） =====
        // 6. 入力データのサニタイズ
        logger.debug('Sanitizing input data');
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
        logger.debug('Sending message to SQS');
        await sendToSqs(sanitizedMessage, env, logger);
        logger.info('Message sent to SQS successfully');

        logger.debug('Returning success response');
        return successResponse(config.successMessage);
      } catch (error) {
        // 8. エラーハンドリング
        logger.error('Error processing request', { error: stringifyError(error) });

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
