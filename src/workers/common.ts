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
export async function verifyTurnstile(token: string, secretKey: string): Promise<TurnstileResponse> {
  const response = await fetch('https://challenges.cloudflare.com/turnstile/v0/siteverify', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ secret: secretKey, response: token }),
  });

  return (await response.json()) as TurnstileResponse;
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
export async function sendToSqs(message: unknown, env: WorkerEnv): Promise<void> {
  // @ts-ignore - aws4fetch is dynamically imported in Cloudflare Workers
  const { AwsClient } = await import('aws4fetch');

  const aws = new AwsClient({
    accessKeyId: env.AWS_ACCESS_KEY_ID,
    secretAccessKey: env.AWS_SECRET_ACCESS_KEY,
    region: env.AWS_REGION,
  });

  const sqsParams = {
    QueueUrl: env.SQS_QUEUE_URL,
    MessageBody: JSON.stringify(message),
  };

  const url = new URL(env.SQS_QUEUE_URL);
  const body = new URLSearchParams({
    Action: 'SendMessage',
    MessageBody: sqsParams.MessageBody,
  }).toString();

  await aws.fetch(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });
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
      return 'Missing required fields';
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
