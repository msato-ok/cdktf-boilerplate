/**
 * コメント投稿 Worker
 *
 * Cloudflare Turnstile で BOT 判定を行い、
 * AWS SQS にコメント投稿内容を送信する。
 */

import { sanitizeString, sanitizeEmail } from './common';
import { createSqsWorker, SqsWorkerRequest } from './sqs-worker-template';

interface CommentRequest extends SqsWorkerRequest {
  name: string;
  email: string;
  comment: string;
  postId?: string;
  parentId?: string;
}

export default createSqsWorker<CommentRequest>({
  workerName: 'comments-worker',
  requiredFields: ['name', 'email', 'comment'],
  messageField: 'comment',
  successMessage: 'Comment submitted',
  sanitize: body => ({
    name: sanitizeString(body.name),
    email: sanitizeEmail(body.email),
    comment: sanitizeString(body.comment),
    postId: body.postId ? sanitizeString(body.postId) : undefined,
    parentId: body.parentId ? sanitizeString(body.parentId) : undefined,
    timestamp: new Date().toISOString(),
    guid: crypto.randomUUID(),
  }),
});
