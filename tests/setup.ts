import { jest } from '@jest/globals';

// Mock environment variables for testing
process.env.ENVIRONMENT = 'test';
process.env.AWS_REGION = 'ap-northeast-1';
process.env.AWS_ACCESS_KEY_ID = 'test-access-key-id';
process.env.AWS_SECRET_ACCESS_KEY = 'test-secret-access-key';
process.env.TF_VAR_cloudflare_api_token = 'test-token';

// Global test timeout
jest.setTimeout(30000);
