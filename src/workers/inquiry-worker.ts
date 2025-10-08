/**
 * 問い合わせフォーム Worker
 *
 * Cloudflare Turnstile で BOT 判定を行い、
 * AWS SQS に問い合わせフォーム内容を送信する。
 */

import { sanitizeString, sanitizeEmail } from './common';
import { createSqsWorker, SqsWorkerRequest } from './sqs-worker-template';

interface InquiryRequest extends SqsWorkerRequest {
  name: string;
  company?: string;
  email: string;
  message: string;
}

export default createSqsWorker<InquiryRequest>({
  requiredFields: ['name', 'email', 'message'],
  messageField: 'message',
  successMessage: 'Inquiry submitted',
  sanitize: body => ({
    name: sanitizeString(body.name),
    company: body.company ? sanitizeString(body.company) : undefined,
    email: sanitizeEmail(body.email),
    message: sanitizeString(body.message),
    timestamp: new Date().toISOString(),
    guid: crypto.randomUUID(),
  }),
});
