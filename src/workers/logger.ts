import type { WorkerEnv } from './common';
import type { ExecutionContextLike } from './types';
import { stringifyError } from './error-utils';

type LogLevel = 'debug' | 'info' | 'warn' | 'error';

interface StructuredLog {
  level: LogLevel;
  worker: string;
  message: string;
  timestamp: string;
  context?: unknown;
}

interface WorkerLoggerOptions {
  env: WorkerEnv;
  notificationQueueUrl: string;
  executionCtx?: ExecutionContextLike;
}

/**
 * Workers 用の簡易ロガー。
 * Cloudflare Workers のコンソールへ構造化ログを出力する。
 */
export class WorkerLogger {
  constructor(private readonly workerName: string, private readonly options: WorkerLoggerOptions) {}

  debug(message: string, context?: unknown): void {
    this.log('debug', message, context);
  }

  info(message: string, context?: unknown): void {
    this.log('info', message, context);
  }

  warn(message: string, context?: unknown): void {
    this.log('warn', message, context);
  }

  error(message: string, context?: unknown): void {
    this.log('error', message, context);
    const task = this.notifyError({ message, context });
    const executionCtx = this.options.executionCtx;
    if (executionCtx) {
      executionCtx.waitUntil(task);
      return;
    }
    void task;
  }

  private log(level: LogLevel, message: string, context?: unknown): void {
    const entry: StructuredLog = {
      level,
      worker: this.workerName,
      message,
      timestamp: new Date().toISOString(),
      ...(context ? { context } : {}),
    };

    switch (level) {
      case 'debug':
        console.debug(entry);
        break;
      case 'info':
        console.info(entry);
        break;
      case 'warn':
        console.warn(entry);
        break;
      case 'error':
        console.error(entry);
        break;
      default:
        console.log(entry);
    }
  }

  private async notifyError(payload: { message: string; context?: unknown }): Promise<void> {
    const entry: StructuredLog = {
      level: 'error',
      worker: this.workerName,
      message: payload.message,
      timestamp: new Date().toISOString(),
      ...(payload.context ? { context: payload.context } : {}),
    };

    try {
      const { sendToSqsWithUrl } = await import('./common');
      await sendToSqsWithUrl(this.options.notificationQueueUrl, entry, this.options.env, this);
    } catch (error) {
      console.warn('[WorkerLogger] Failed to push error notification to SQS', stringifyError(error));
    }
  }
}

export function createWorkerLogger(
  workerName: string,
  env?: WorkerEnv,
  executionCtx?: ExecutionContextLike,
): WorkerLogger {
  const queueUrl = env?.NOTIFICATION_SQS_QUEUE_URL;
  if (!env || !queueUrl) {
    throw new Error('NOTIFICATION_SQS_QUEUE_URL is not configured. This worker requires notification queue settings.');
  }
  if (queueUrl.trim().length === 0) {
    throw new Error('NOTIFICATION_SQS_QUEUE_URL must not be empty.');
  }
  return new WorkerLogger(workerName, { env, notificationQueueUrl: queueUrl, executionCtx });
}
