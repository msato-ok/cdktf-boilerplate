export const CLOUDFLARE_STACK_ID = 'cloudflare' as const;

export function getAccessAppName(subdomain: string, domain: string, environment: string): string {
  const full = `${subdomain}.${domain}`;
  return `${full} Access (${environment})`;
}

export function getIdentityProviderName(subdomain: string, domain: string): string {
  const full = `${subdomain}.${domain}`;
  return `Google IDP for ${full}`;
}

export function getAccessPolicyName(allowedEmailDomain: string): string {
  return `Allow ${allowedEmailDomain} domain`;
}
