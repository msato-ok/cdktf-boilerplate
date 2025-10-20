import { WorkerLogger } from './logger';
import { stringifyError } from './error-utils';

/**
 * Cloudflare Workers 共通ユーティリティ
 */

/**
 * 環境変数の型定義
 */
export interface WorkerEnv {
  AWS_ACCESS_KEY_ID: string;
  AWS_SECRET_ACCESS_KEY: string;
  AWS_REGION: string;
  SQS_QUEUE_URL: string;
  TURNSTILE_SECRET_KEY: string;
  NOTIFICATION_SQS_QUEUE_URL: string;
}

/**
 * Turnstile検証レスポンス
 */
export interface TurnstileResponse {
  success: boolean;
  challenge_ts?: string;
  hostname?: string;
  'error-codes'?: string[];
}

/**
 * CORSヘッダー
 */
export const CORS_HEADERS = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Methods': 'POST, OPTIONS',
  'Access-Control-Allow-Headers': 'Content-Type',
};

/**
 * メッセージの最大文字数
 */
export const MAX_MESSAGE_LENGTH = 10000;

/**
 * Turnstileトークンを検証
 */
export async function verifyTurnstile(
  token: string,
  secretKey: string,
  logger: WorkerLogger,
): Promise<TurnstileResponse> {
  if (!logger) {
    throw new Error('verifyTurnstile requires a WorkerLogger instance.');
  }

  // ローカル開発環境（テスト用シークレット）では常に成功を返す
  if (secretKey === '1x0000000000000000000000000000000AA') {
    logger.info('[Turnstile] Using test secret key - bypassing verification');
    return { success: true };
  }

  try {
    const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ secret: secretKey, response: token }),
    });

    if (!response.ok) {
      logger.error('[Turnstile] API returned error', { status: response.status });
      return { success: false, 'error-codes': ['api-error'] };
    }

    return (await response.json()) as TurnstileResponse;
  } catch (error) {
    logger.error('[Turnstile] Failed to verify token', { error: stringifyError(error) });
    return { success: false, 'error-codes': ['network-error'] };
  }
}

/**
 * 文字列をサニタイズ（トリムとHTMLタグ除去）
 */
export function sanitizeString(input: string): string {
  return input.trim().replace(/[<>]/g, '');
}

/**
 * メールアドレスをサニタイズして検証
 */
export function sanitizeEmail(email: string): string {
  const sanitized = email.trim().toLowerCase();
  // 基本的なメールアドレスバリデーション
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(sanitized)) {
    throw new Error('Invalid email format');
  }
  return sanitized;
}

/**
 * SQSにメッセージを送信
 */
export async function sendToSqs(message: unknown, env: WorkerEnv, logger: WorkerLogger): Promise<void> {
  await sendToSqsWithUrl(env.SQS_QUEUE_URL, message, env, logger);
}

export async function sendToSqsWithUrl(
  queueUrl: string,
  message: unknown,
  env: WorkerEnv,
  logger: WorkerLogger,
): Promise<void> {
  try {
    // @ts-ignore - aws4fetch is dynamically imported in Cloudflare Workers
    const { AwsClient } = await import('aws4fetch');

    const aws = new AwsClient({
      accessKeyId: env.AWS_ACCESS_KEY_ID,
      secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
      region: env.AWS_REGION,
    });

    const url = new URL(queueUrl);
    const body = new URLSearchParams({
      Action: 'SendMessage',
      MessageBody: JSON.stringify(message),
    }).toString();

    const response = await aws.fetch(url.toString(), {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body,
    });

    const responseText = await response.text();
    if (!response.ok) {
      throw new Error(`SQS API error: ${response.status} - ${responseText}`);
    }

    logger.info('[SQS] Message sent successfully');
  } catch (error) {
    console.error('[SQS] Failed to send message', { error: stringifyError(error) });
    throw new Error('Failed to send message to SQS');
  }
}

/**
 * エラーレスポンスを生成
 */
export function errorResponse(message: string, status: number): Response {
  return new Response(JSON.stringify({ error: message }), {
    status,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * 成功レスポンスを生成
 */
export function successResponse(message: string): Response {
  return new Response(JSON.stringify({ success: true, message }), {
    status: 202,
    headers: { ...CORS_HEADERS, 'Content-Type': 'application/json', 'Cache-Control': 'no-store' },
  });
}

/**
 * CORSプリフライトレスポンスを生成
 */
export function corsPreflightResponse(): Response {
  return new Response(null, { headers: CORS_HEADERS });
}

/**
 * 必須フィールドのバリデーション
 */
export function validateRequiredFields(body: unknown, fields: string[]): string | null {
  if (typeof body !== 'object' || body === null) {
    return 'Invalid request body';
  }

  const obj = body as Record<string, unknown>;
  for (const field of fields) {
    if (!obj[field]) {
      return `Missing required fields: ${field}`;
    }
  }
  return null;
}

/**
 * メッセージ長のバリデーション
 */
export function validateMessageLength(message: string, maxLength: number = MAX_MESSAGE_LENGTH): string | null {
  if (message.length > maxLength) {
    return `Message too long (max ${maxLength} characters)`;
  }
  return null;
}
