import * as https from 'https';
import { loadServiceAccount, makeApiRequest, requestAccessToken } from './google-rest';

export async function lookupProjectNumber(
  projectId: string,
): Promise<{ status: string; projectNumber?: string; detail?: string }> {
  const sa = loadServiceAccount();
  if (!sa) return { status: 'auth_error', detail: 'no_service_account' };
  const tokenResult = await requestAccessToken(sa);
  if (!tokenResult.ok || !tokenResult.token) return { status: 'auth_error', detail: tokenResult.error };
  const resp = await makeApiRequest(tokenResult.token, {
    method: 'GET',
    hostname: 'cloudresourcemanager.googleapis.com',
    path: `/v1/projects/${encodeURIComponent(projectId)}`,
  });
  if (resp.ok && resp.data) {
    const data = resp.data as Record<string, unknown>;
    const pn = data && typeof data.projectNumber !== 'undefined' ? String((data as any).projectNumber) : '';
    return pn ? { status: 'ok', projectNumber: pn } : { status: 'error', detail: 'missing_projectNumber' };
  }
  const [status, detail] = (resp.error || 'error').split(':', 2);
  return { status, detail };
}

export async function checkOAuthClientCredentials(
  clientId: string,
  clientSecret: string,
): Promise<{ status: 'accepted' | 'invalid' | 'error'; detail?: string }> {
  const body = 'grant_type=refresh_token&refresh_token=invalid-refresh-token';
  const auth = Buffer.from(`${clientId}:${clientSecret}`).toString('base64');
  return new Promise(resolve => {
    const req = https.request(
      {
        method: 'POST',
        hostname: 'oauth2.googleapis.com',
        path: '/token',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Content-Length': Buffer.byteLength(body),
          Authorization: `Basic ${auth}`,
        },
      },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          const code = res.statusCode || 0;
          if (code === 400) return resolve({ status: 'accepted', detail: 'invalid_grant' });
          if (code === 401) return resolve({ status: 'invalid', detail: 'invalid_client' });
          return resolve({ status: 'error', detail: `unexpected_status:${code}` });
        });
      },
    );
    req.on('error', () => resolve({ status: 'error', detail: 'network' }));
    req.write(body);
    req.end();
  });
}

export async function checkServiceAccountPermissions(
  projectId: string,
  permissions: string[] = ['resourcemanager.projects.get'],
): Promise<{ status: string; detail?: string; missing?: string[]; granted?: string[]; checked?: string[] }> {
  const sa = loadServiceAccount();
  if (!sa) return { status: 'auth_error', detail: 'no_service_account' };
  const tokenResult = await requestAccessToken(sa);
  if (!tokenResult.ok || !tokenResult.token) return { status: 'auth_error', detail: tokenResult.error };
  const body = JSON.stringify({ permissions });
  const resp = await makeApiRequest(
    tokenResult.token,
    {
      method: 'POST',
      hostname: 'cloudresourcemanager.googleapis.com',
      path: `/v1/projects/${encodeURIComponent(projectId)}:testIamPermissions`,
      headers: { 'Content-Type': 'application/json' },
    },
    body,
  );
  if (resp.ok && resp.data) {
    const data = resp.data as { permissions?: unknown };
    const granted = Array.isArray(data.permissions) ? (data.permissions as string[]) : [];
    const grantedSet = new Set(granted);
    const missing = permissions.filter(p => !grantedSet.has(p));
    return missing.length > 0
      ? { status: 'perm_error', missing, granted, checked: permissions }
      : { status: 'ok', granted, checked: permissions };
  }
  return { status: 'perm_error', detail: resp.error || 'unknown_error' };
}

export { loadServiceAccount } from './google-rest';
