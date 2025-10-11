import { S3Backend } from 'cdktf';
import {
  CloudflareMediaStack,
  StaticContentStack,
  QueueStack,
  WorkerStack,
  StaticSiteZoneStack,
  WorkersDnsStack,
  MonitoringStack,
  WranglerConfigStack,
  TurnstileStack,
} from '@minr-dev/cdktf-toolkit';

/**
 * S3Backendの設定を簡単にするヘルパー関数
 */
export function configureRemoteState(
  stack:
    | CloudflareMediaStack
    | StaticContentStack
    | QueueStack
    | WorkerStack
    | StaticSiteZoneStack
    | WorkersDnsStack
    | MonitoringStack
    | WranglerConfigStack
    | TurnstileStack,
  config: {
    stateBucket: string;
    stateKeyPrefix: string;
    environment: string;
    stackId: string;
    stateRegion: string;
    stateDynamodbTable: string;
  },
): void {
  const backendKey = `${config.stateKeyPrefix}/${config.environment}/${config.stackId}.tfstate`;

  new S3Backend(stack, {
    bucket: config.stateBucket,
    key: backendKey,
    region: config.stateRegion,
    dynamodbTable: config.stateDynamodbTable,
    encrypt: true,
  });
}
