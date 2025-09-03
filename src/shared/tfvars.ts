import * as fs from 'fs';

export function pickTfvarsPath(environment: string): string | undefined {
  const primary = `terraform.${environment}.tfvars`;
  const fallback = 'terraform.tfvars';
  if (fs.existsSync(primary)) return primary;
  if (fs.existsSync(fallback)) return fallback;
  return undefined;
}

export function parseSimpleTfvars(content: string): Record<string, string> {
  const map: Record<string, string> = {};
  const lines = content.split(/\r?\n/);
  for (const line of lines) {
    const m = line.match(/^\s*([A-Za-z0-9_]+)\s*=\s*(.+?)\s*$/);
    if (!m) continue;
    const key = m[1];
    let val = m[2];
    const qm = val.match(/^"([\s\S]*)"$/);
    if (qm) val = qm[1];
    map[key] = val;
  }
  return map;
}

export function readFileSafe(p: string): string | undefined {
  try {
    return fs.readFileSync(p, 'utf8');
  } catch {
    return undefined;
  }
}

export function loadCloudflareConfig(environment: string): {
  accountId?: string;
  domain?: string;
  subdomain?: string;
  token?: string;
  targetIpAddress?: string;
  googleClientId?: string;
  googleClientSecret?: string;
  allowedEmailDomain?: string;
} {
  const tfvarsPath = pickTfvarsPath(environment);
  const out: {
    accountId?: string;
    domain?: string;
    subdomain?: string;
    token?: string;
    targetIpAddress?: string;
    googleClientId?: string;
    googleClientSecret?: string;
    allowedEmailDomain?: string;
  } = {};
  if (tfvarsPath) {
    const vars = parseSimpleTfvars(readFileSafe(tfvarsPath) || '');
    out.accountId = vars.cloudflare_account_id;
    out.domain = vars.domain_name;
    out.subdomain = vars.subdomain_name;
    out.token = vars.cloudflare_api_token;
    out.targetIpAddress = vars.target_ip_address;
    out.googleClientId = vars.google_client_id;
    out.googleClientSecret = vars.google_client_secret;
    out.allowedEmailDomain = vars.allowed_email_domain;
  }
  // Environment variable override for token
  if (process.env.CLOUDFLARE_API_TOKEN) out.token = process.env.CLOUDFLARE_API_TOKEN;
  return out;
}

export function loadGoogleConfig(environment: string): {
  projectId?: string;
  googleProjectNumber?: string;
  cloudflareTeamDomain?: string;
  domainName?: string;
  subdomainName?: string;
  supportEmail?: string;
  googleClientId?: string;
  googleClientSecret?: string;
} {
  const tfvarsPath = pickTfvarsPath(environment);
  const out: {
    projectId?: string;
    googleProjectNumber?: string;
    cloudflareTeamDomain?: string;
    domainName?: string;
    subdomainName?: string;
    supportEmail?: string;
    googleClientId?: string;
    googleClientSecret?: string;
  } = {};
  if (tfvarsPath) {
    const vars = parseSimpleTfvars(readFileSafe(tfvarsPath) || '');
    out.projectId = vars.google_project_id;
    out.googleProjectNumber = vars.google_project_number;
    out.cloudflareTeamDomain = vars.cloudflare_team_domain;
    out.domainName = vars.domain_name;
    out.subdomainName = vars.subdomain_name;
    out.supportEmail = vars.support_email;
    out.googleClientId = vars.google_client_id;
    out.googleClientSecret = vars.google_client_secret;
  }
  return out;
}
