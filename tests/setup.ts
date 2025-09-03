import { jest } from '@jest/globals';

// Mock environment variables for testing
process.env.ENVIRONMENT = 'test';

// Global test timeout
jest.setTimeout(30000);
