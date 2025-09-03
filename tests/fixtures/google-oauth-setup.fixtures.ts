import { GoogleOAuthSetupProps } from '../../src/constructs/google-oauth-app';

export const googleOAuthSetupFixtures = {
  development: {
    projectId: 'dev-cloudflare-access-123',
    displayName: 'Development OAuth App',
    cloudflareTeamName: 'dev-team',
    environment: 'dev',
    domainName: 'dev-example.com',
    subdomainName: 'test-app',
  } as GoogleOAuthSetupProps,

  production: {
    projectId: 'prod-cloudflare-access-456',
    displayName: 'Production OAuth App',
    cloudflareTeamName: 'my-company',
    environment: 'prod',
    domainName: 'example.com',
    subdomainName: 'app',
  } as GoogleOAuthSetupProps,

  staging: {
    projectId: 'staging-project-789',
    displayName: 'Staging OAuth App',
    cloudflareTeamName: 'staging-team',
    environment: 'staging',
    domainName: 'staging.example.com',
    subdomainName: 'api',
  } as GoogleOAuthSetupProps,

  minimal: {
    projectId: 'minimal-project',
    displayName: 'Minimal App',
    cloudflareTeamName: 'team',
    environment: 'test',
    domainName: 'test.com',
    subdomainName: 'sub',
  } as GoogleOAuthSetupProps,

  withSpecialChars: {
    projectId: 'special-chars-project-2024',
    displayName: 'Special Characters Test',
    cloudflareTeamName: 'test-team-123',
    environment: 'test',
    domainName: 'example-domain.co.jp',
    subdomainName: 'api-v1',
  } as GoogleOAuthSetupProps,
};

export const expectedRedirectUris = {
  development: 'https://dev-team.cloudflareaccess.com/cdn-cgi/access/callback',
  production: 'https://my-company.cloudflareaccess.com/cdn-cgi/access/callback',
  staging: 'https://staging-team.cloudflareaccess.com/cdn-cgi/access/callback',
  minimal: 'https://team.cloudflareaccess.com/cdn-cgi/access/callback',
  withSpecialChars: 'https://test-team-123.cloudflareaccess.com/cdn-cgi/access/callback',
};

export const expectedFullDomains = {
  development: 'test-app.dev-example.com',
  production: 'app.example.com',
  staging: 'api.staging.example.com',
  minimal: 'sub.test.com',
  withSpecialChars: 'api-v1.example-domain.co.jp',
};
