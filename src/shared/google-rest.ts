/**
 * Google Cloud Service Account authentication and REST helpers
 */
import * as fs from 'fs';
import * as https from 'https';
import * as crypto from 'crypto';

export interface ServiceAccount {
  client_email: string;
  private_key: string;
}

export interface TokenResult {
  ok: boolean;
  token?: string;
  error?: string;
}

export interface ApiRequestOptions {
  method: string;
  hostname: string;
  path: string;
  headers?: Record<string, string>;
}

export interface ApiResponse<T = any> {
  ok: boolean;
  data?: T;
  error?: string;
  statusCode?: number;
}

export function loadServiceAccount(): ServiceAccount | null {
  if (process.env.GOOGLE_CREDENTIALS) {
    try {
      return JSON.parse(process.env.GOOGLE_CREDENTIALS) as ServiceAccount;
    } catch {
      // ignore parse error
    }
  }
  if (process.env.GOOGLE_APPLICATION_CREDENTIALS) {
    try {
      return JSON.parse(fs.readFileSync(process.env.GOOGLE_APPLICATION_CREDENTIALS, 'utf8')) as ServiceAccount;
    } catch {
      // ignore parse error
    }
  }
  return null;
}

function createJWT(sa: ServiceAccount, scope: string): string {
  const header = Buffer.from(JSON.stringify({ alg: 'RS256', typ: 'JWT' })).toString('base64url');
  const iat = Math.floor(Date.now() / 1000);
  const payloadObj = { iss: sa.client_email, scope, aud: 'https://oauth2.googleapis.com/token', iat, exp: iat + 3600 };
  const payload = Buffer.from(JSON.stringify(payloadObj)).toString('base64url');
  const signer = crypto.createSign('RSA-SHA256');
  signer.update(`${header}.${payload}`);
  signer.end();
  const signature = signer.sign(sa.private_key).toString('base64url');
  return `${header}.${payload}.${signature}`;
}

export function requestAccessToken(
  sa: ServiceAccount,
  scope = 'https://www.googleapis.com/auth/cloud-platform.read-only',
): Promise<TokenResult> {
  return new Promise(resolve => {
    try {
      const assertion = createJWT(sa, scope);
      const body = `grant_type=urn%3Aietf%3Aparams%3Aoauth%3Agrant-type%3Ajwt-bearer&assertion=${assertion}`;
      const req = https.request(
        {
          method: 'POST',
          hostname: 'oauth2.googleapis.com',
          path: '/token',
          headers: {
            'Content-Type': 'application/x-www-form-urlencoded',
            'Content-Length': Buffer.byteLength(body),
          },
        },
        res => {
          let data = '';
          res.on('data', c => (data += c));
          res.on('end', () => {
            if (res.statusCode === 200) {
              try {
                const json = JSON.parse(data);
                return resolve({ ok: true, token: json.access_token });
              } catch {
                return resolve({ ok: false, error: 'token_parse_error' });
              }
            }
            try {
              const err = JSON.parse(data);
              const code = res.statusCode || 0;
              const kind = err.error || 'unknown';
              const desc = err.error_description || err.error_subtype || '';
              return resolve({
                ok: false,
                error: `token_error:${code}:${kind}${desc ? ':' + String(desc).replace(/\s+/g, ' ') : ''}`,
              });
            } catch {
              return resolve({ ok: false, error: `token_error:${res.statusCode}` });
            }
          });
        },
      );
      req.on('error', () => resolve({ ok: false, error: 'network_error' }));
      req.write(body);
      req.end();
    } catch (e) {
      resolve({ ok: false, error: (e as Error).message || 'sign_error' });
    }
  });
}

export function makeApiRequest<T = any>(
  token: string,
  options: ApiRequestOptions,
  body?: string,
): Promise<ApiResponse<T>> {
  return new Promise(resolve => {
    const headers: Record<string, string> = { ...(options.headers || {}), Authorization: `Bearer ${token}` };
    if (body) headers['Content-Length'] = Buffer.byteLength(body).toString();
    const req = https.request(
      { method: options.method, hostname: options.hostname, path: options.path, headers },
      res => {
        let data = '';
        res.on('data', c => (data += c));
        res.on('end', () => {
          try {
            const code = res.statusCode || 0;
            if (code >= 200 && code < 300) {
              const json = data ? JSON.parse(data) : {};
              return resolve({ ok: true, data: json, statusCode: code });
            }
            let errorDetail = 'unknown';
            try {
              const err = JSON.parse(data);
              errorDetail = (err.error && (err.error.status || err.error.message)) || errorDetail;
            } catch {
              // ignore parse error
            }
            const statusMap: Record<number, string> = {
              401: 'unauthenticated',
              403: 'permission_denied',
              404: 'not_found',
            };
            const status = statusMap[code] || 'error';
            return resolve({ ok: false, error: `${status}:${errorDetail}`, statusCode: code });
          } catch {
            return resolve({ ok: false, error: 'parse_error', statusCode: res.statusCode });
          }
        });
      },
    );
    req.on('error', () => resolve({ ok: false, error: 'network_error' }));
    if (body) req.write(body);
    req.end();
  });
}
