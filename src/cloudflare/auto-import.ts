#!/usr/bin/env ts-node
/**
 * Auto-import existing Cloudflare Access Application into CDKTF/Tofu state.
 */
import { spawn } from 'child_process';
import * as https from 'https';
import * as path from 'path';
import { CLOUDFLARE_STACK_ID, getAccessPolicyName, getIdentityProviderName } from './utils';
import { loadCloudflareConfig, readFileSafe } from '../shared/tfvars';

const ENVIRONMENT = process.env.ENVIRONMENT || 'prod';

function fetchJson(url: string, token: string): Promise<unknown> {
  return new Promise((resolve, reject) => {
    const req = https.request(
      url,
      {
        method: 'GET',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
      },
      res => {
        const chunks: Buffer[] = [];
        res.on('data', (d: Buffer | string) => {
          const chunk = typeof d === 'string' ? Buffer.from(d) : d;
          chunks.push(chunk);
        });
        res.on('end', () => {
          const body = Buffer.concat(chunks).toString('utf8');
          if (res.statusCode && res.statusCode >= 200 && res.statusCode < 300) {
            try {
              resolve(JSON.parse(body) as unknown);
            } catch (e) {
              reject(new Error(`Invalid JSON from Cloudflare API: ${String(e)}`));
            }
          } else {
            reject(new Error(`Cloudflare API error ${res.statusCode}: ${body}`));
          }
        });
      },
    );
    req.on('error', reject);
    req.end();
  });
}

function findAccessApplicationKey(cdkJson: unknown): string | undefined {
  if (!cdkJson || typeof cdkJson !== 'object') return undefined;
  const root = cdkJson as { resource?: { cloudflare_zero_trust_access_application?: Record<string, unknown> } };
  const res = root.resource?.cloudflare_zero_trust_access_application;
  if (!res) return undefined;
  const keys = Object.keys(res);
  if (keys.length === 0) return undefined;
  const preferred = keys.find(k => {
    const node = res[k] as any;
    const metaPath = node?.['//']?.metadata?.path;
    return typeof metaPath === 'string' && metaPath.endsWith('/application');
  });
  return preferred || keys[0];
}

function findIdentityProviderKey(cdkJson: unknown): string | undefined {
  if (!cdkJson || typeof cdkJson !== 'object') return undefined;
  const root = cdkJson as { resource?: { cloudflare_zero_trust_access_identity_provider?: Record<string, unknown> } };
  const res = root.resource?.cloudflare_zero_trust_access_identity_provider;
  if (!res) return undefined;
  const keys = Object.keys(res);
  if (keys.length === 0) return undefined;
  const preferred = keys.find(k => {
    const node = (res as any)[k];
    const metaPath = node?.['//']?.metadata?.path;
    return typeof metaPath === 'string' && metaPath.endsWith('/google_idp');
  });
  return preferred || keys[0];
}

function findAccessPolicyKey(cdkJson: unknown): string | undefined {
  if (!cdkJson || typeof cdkJson !== 'object') return undefined;
  const root = cdkJson as { resource?: { cloudflare_zero_trust_access_policy?: Record<string, unknown> } };
  const res = root.resource?.cloudflare_zero_trust_access_policy;
  if (!res) return undefined;
  const keys = Object.keys(res);
  if (keys.length === 0) return undefined;
  const preferred = keys.find(k => {
    const node = (res as any)[k];
    const metaPath = node?.['//']?.metadata?.path;
    return typeof metaPath === 'string' && metaPath.endsWith('/policy');
  });
  return preferred || keys[0];
}

function execProc(cmd: string, args: string[], opts: { cwd?: string; env?: NodeJS.ProcessEnv }): Promise<boolean> {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: 'inherit', cwd: opts.cwd, env: opts.env });
    child.on('close', code => resolve(code === 0));
    child.on('error', () => resolve(false));
  });
}

function execCapture(
  cmd: string,
  args: string[],
  opts: { cwd?: string; env?: NodeJS.ProcessEnv },
): Promise<{ ok: boolean; stdout: string }> {
  return new Promise(resolve => {
    const child = spawn(cmd, args, { stdio: ['ignore', 'pipe', 'pipe'], cwd: opts.cwd, env: opts.env });
    const chunks: Buffer[] = [];
    child.stdout.on('data', d => {
      const b = typeof d === 'string' ? Buffer.from(d) : (d as Buffer);
      chunks.push(b);
    });
    // Intentionally silence/ignore stderr to avoid noisy red warnings when state is absent
    child.on('close', code => resolve({ ok: code === 0, stdout: Buffer.concat(chunks).toString('utf8') }));
    child.on('error', () => resolve({ ok: false, stdout: '' }));
  });
}

// 環境変数に依存せず、定数で Terraform 実装を指定する
const TF_BIN = 'tofu';

async function ensureInit(stackDir: string, env: NodeJS.ProcessEnv): Promise<boolean> {
  // Initialize backend/plugins non-interactively
  return execProc(TF_BIN, ['init', '-input=false', '-reconfigure'], { cwd: stackDir, env });
}

async function runImport(addr: string, id: string, extraEnv?: Record<string, string>): Promise<boolean> {
  const env = { ...process.env, STACK: CLOUDFLARE_STACK_ID, ENVIRONMENT, TF_INPUT: '0', ...(extraEnv || {}) };
  const stackDir = path.join('cdktf.out', 'stacks', CLOUDFLARE_STACK_ID);
  const okInit = await ensureInit(stackDir, env);
  if (!okInit) return false;
  return await execProc(TF_BIN, ['import', addr, id], { cwd: stackDir, env });
}

async function isManaged(addr: string, extraEnv?: Record<string, string>): Promise<boolean> {
  const env = { ...process.env, STACK: CLOUDFLARE_STACK_ID, ENVIRONMENT, TF_INPUT: '0', ...(extraEnv || {}) };
  const stackDir = path.join('cdktf.out', 'stacks', CLOUDFLARE_STACK_ID);
  const okInit = await ensureInit(stackDir, env);
  if (!okInit) return false;
  const { ok, stdout } = await execCapture(TF_BIN, ['state', 'list', '-no-color'], { cwd: stackDir, env });
  if (!ok) return false;
  const lines = stdout
    .split(/\r?\n/)
    .map(s => s.trim())
    .filter(Boolean);
  return lines.includes(addr);
}

async function getStateResourceId(addr: string, extraEnv?: Record<string, string>): Promise<string | undefined> {
  const env = { ...process.env, STACK: CLOUDFLARE_STACK_ID, ENVIRONMENT, TF_INPUT: '0', ...(extraEnv || {}) };
  const stackDir = path.join('cdktf.out', 'stacks', CLOUDFLARE_STACK_ID);
  const okInit = await ensureInit(stackDir, env);
  if (!okInit) return undefined;
  const { ok, stdout } = await execCapture(TF_BIN, ['state', 'pull'], { cwd: stackDir, env });
  if (!ok) return undefined;
  try {
    const state = JSON.parse(stdout);
    const [type, name] = addr.split('.', 2);
    const res = (state?.resources as any[])?.find(r => r?.type === type && r?.name === name);
    const inst = res?.instances?.[0];
    const id = inst?.attributes?.id ?? inst?.attributes_flat?.id;
    return typeof id === 'string' && id ? id : undefined;
  } catch {
    return undefined;
  }
}

async function stateRm(addr: string, extraEnv?: Record<string, string>): Promise<boolean> {
  const env = { ...process.env, STACK: CLOUDFLARE_STACK_ID, ENVIRONMENT, TF_INPUT: '0', ...(extraEnv || {}) };
  const stackDir = path.join('cdktf.out', 'stacks', CLOUDFLARE_STACK_ID);
  const okInit = await ensureInit(stackDir, env);
  if (!okInit) return false;
  return execProc(TF_BIN, ['state', 'rm', addr], { cwd: stackDir, env });
}

export async function runCfAutoImport(): Promise<void> {
  const cfg = loadCloudflareConfig(ENVIRONMENT);
  const {
    accountId,
    domain,
    subdomain,
    token,
    targetIpAddress,
    googleClientId,
    googleClientSecret,
    allowedEmailDomain,
  } = cfg;
  if (!accountId || !domain || !subdomain || !token) {
    console.error('[cf-auto-import] Missing accountId/domain/subdomain/token; skip import');
    return;
  }

  const fullDomain = `${subdomain}.${domain}`;
  // Note: Access アプリの import は domain 完全一致で行うため、名前は使用しない。
  // 1) Try Access App import by domain, fallback to name
  {
    // Self-hosted Access アプリはアプリケーション URL（=サブドメイン）が一意になる前提のため、
    // domain 完全一致のみで検索する。
    const byDomainUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
      accountId,
    )}/access/apps?domain=${encodeURIComponent(fullDomain)}`;
    let resp: { success?: boolean; result?: Array<{ id?: string; domain?: string; name?: string }> } | undefined;
    try {
      const data = await fetchJson(byDomainUrl, token);
      resp = data as { success?: boolean; result?: Array<{ id?: string; domain?: string; name?: string }> };
    } catch (e) {
      console.error(`[cf-auto-import] Access lookup by domain failed: ${(e as Error).message}`);
    }
    // ドメイン完全一致でフィルタ
    let candidates = resp?.success === true && Array.isArray(resp?.result) ? resp.result : [];
    candidates = candidates.filter(r => (r?.domain || '').toLowerCase() === fullDomain.toLowerCase());
    if (Array.isArray(candidates) && candidates.length > 0) {
      const appId: string | undefined = candidates?.[0]?.id;
      if (appId) {
        const cdkPath = path.join('cdktf.out', 'stacks', CLOUDFLARE_STACK_ID, 'cdk.tf.json');
        const cdkRaw = readFileSafe(cdkPath);
        if (cdkRaw) {
          const cdk = JSON.parse(cdkRaw);
          const key = findAccessApplicationKey(cdk);
          if (key) {
            const addr = `cloudflare_zero_trust_access_application.${key}`;
            const importId = `accounts/${accountId}/${appId}`;
            const tfEnv: Record<string, string> = {
              TF_VAR_cloudflare_api_token: token,
              TF_VAR_cloudflare_account_id: accountId,
              TF_VAR_domain_name: domain,
              TF_VAR_subdomain_name: subdomain,
              ...(targetIpAddress ? { TF_VAR_target_ip_address: targetIpAddress } : {}),
              ...(googleClientId ? { TF_VAR_google_client_id: googleClientId } : {}),
              ...(googleClientSecret ? { TF_VAR_google_client_secret: googleClientSecret } : {}),
              ...(allowedEmailDomain ? { TF_VAR_allowed_email_domain: allowedEmailDomain } : {}),
            };
            if (await isManaged(addr, tfEnv)) {
              // Verify remote existence; if gone, drop from state to allow recreation
              const stateId = await getStateResourceId(addr, tfEnv);
              let remoteExists = false;
              if (stateId) {
                try {
                  const checkUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
                    accountId,
                  )}/access/apps/${encodeURIComponent(stateId)}`;
                  const resp = (await fetchJson(checkUrl, token)) as any;
                  remoteExists = !!(resp && resp.success === true && resp.result && resp.result.id);
                } catch {
                  remoteExists = false;
                }
              }
              if (!remoteExists) {
                console.log(`[cf-auto-import] State has ${addr} but remote missing; removing from state`);
                await stateRm(addr, tfEnv);
              } else {
                console.log(`[cf-auto-import] Skip import (already managed): ${addr}`);
              }
            }
            if (!(await isManaged(addr, tfEnv))) {
              console.log(`[cf-auto-import] Import ${addr} <- ${importId}`);
              await runImport(addr, importId, tfEnv);
            }
          }
        }
      }
    } else {
      console.log('[cf-auto-import] No existing Access app found');
    }
  }

  // 2) Try DNS Record import to avoid identical-record 400
  try {
    // Fetch Zone ID by domain
    const zoneResp = (await fetchJson(
      `https://api.cloudflare.com/client/v4/zones?name=${encodeURIComponent(domain)}&status=active`,
      token,
    )) as { success?: boolean; result?: Array<{ id?: string }> };
    const zoneId = zoneResp?.result?.[0]?.id;
    if (!zoneId) throw new Error('zone id not found');

    // Find record by type/name
    const rrResp = (await fetchJson(
      `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(
        zoneId,
      )}/dns_records?type=A&name=${encodeURIComponent(fullDomain)}`,
      token,
    )) as { success?: boolean; result?: Array<{ id?: string }> };
    const recId = rrResp?.result?.[0]?.id;
    if (recId) {
      const cdkPath = path.join('cdktf.out', 'stacks', CLOUDFLARE_STACK_ID, 'cdk.tf.json');
      const cdkRaw = readFileSafe(cdkPath);
      if (cdkRaw) {
        const cdk: unknown = JSON.parse(cdkRaw);
        const rrNode: unknown = (cdk as any)?.resource?.cloudflare_dns_record;
        const key =
          typeof rrNode === 'object' && rrNode !== null ? Object.keys(rrNode as Record<string, unknown>)[0] : undefined;
        if (key) {
          const addr = `cloudflare_dns_record.${key}`;
          const importId = `${zoneId}/${recId}`;
          const tfEnv: Record<string, string> = {
            TF_VAR_cloudflare_api_token: token,
            TF_VAR_cloudflare_account_id: accountId,
            TF_VAR_domain_name: domain,
            TF_VAR_subdomain_name: subdomain,
            ...(targetIpAddress ? { TF_VAR_target_ip_address: targetIpAddress } : {}),
            ...(googleClientId ? { TF_VAR_google_client_id: googleClientId } : {}),
            ...(googleClientSecret ? { TF_VAR_google_client_secret: googleClientSecret } : {}),
            ...(allowedEmailDomain ? { TF_VAR_allowed_email_domain: allowedEmailDomain } : {}),
          };
          if (await isManaged(addr, tfEnv)) {
            // Verify DNS record still exists; if gone, remove from state
            const stateId = await getStateResourceId(addr, tfEnv);
            let remoteExists = false;
            if (stateId) {
              try {
                const rrUrl = `https://api.cloudflare.com/client/v4/zones/${encodeURIComponent(
                  zoneId,
                )}/dns_records/${encodeURIComponent(stateId)}`;
                const resp = (await fetchJson(rrUrl, token)) as any;
                remoteExists = !!(resp && resp.success === true && resp.result && resp.result.id);
              } catch {
                remoteExists = false;
              }
            }
            if (!remoteExists) {
              console.log(`[cf-auto-import] State has ${addr} but remote missing; removing from state`);
              await stateRm(addr, tfEnv);
            } else {
              console.log(`[cf-auto-import] Skip import (already managed): ${addr}`);
            }
          }
          if (!(await isManaged(addr, tfEnv))) {
            console.log(`[cf-auto-import] Import ${addr} <- ${importId}`);
            await runImport(addr, importId, tfEnv);
          }
        }
      }
    } else {
      console.log('[cf-auto-import] No existing DNS record found');
    }
  } catch (e) {
    console.error(`[cf-auto-import] DNS import skipped: ${(e as Error).message}`);
  }

  // 3) Try Identity Provider import (Google)
  try {
    const cdkPath = path.join('cdktf.out', 'stacks', CLOUDFLARE_STACK_ID, 'cdk.tf.json');
    const cdkRaw = readFileSafe(cdkPath);
    if (cdkRaw) {
      const cdk = JSON.parse(cdkRaw);
      const key = findIdentityProviderKey(cdk);
      if (key) {
        const addr = `cloudflare_zero_trust_access_identity_provider.${key}`;
        const tfEnv: Record<string, string> = {
          TF_VAR_cloudflare_api_token: token,
          TF_VAR_cloudflare_account_id: accountId,
          TF_VAR_domain_name: domain,
          TF_VAR_subdomain_name: subdomain,
          ...(targetIpAddress ? { TF_VAR_target_ip_address: targetIpAddress } : {}),
          ...(googleClientId ? { TF_VAR_google_client_id: googleClientId } : {}),
          ...(googleClientSecret ? { TF_VAR_google_client_secret: googleClientSecret } : {}),
          ...(allowedEmailDomain ? { TF_VAR_allowed_email_domain: allowedEmailDomain } : {}),
        };
        // Lookup existing IDP by name and type
        const idpUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
          accountId,
        )}/access/identity_providers`;
        const resp = (await fetchJson(idpUrl, token)) as {
          success?: boolean;
          result?: Array<{ id?: string; name?: string; type?: string }>;
        };
        const candidates = Array.isArray(resp?.result) ? resp.result : [];
        const expectedName = getIdentityProviderName(subdomain, domain).toLowerCase();
        const match = candidates.find(
          r => (r?.name || '').toLowerCase() === expectedName && (r?.type || '').toLowerCase() === 'google',
        );
        const idpId = match?.id;
        if (idpId) {
          if (await isManaged(addr, tfEnv)) {
            // Verify it still exists
            const stateId = await getStateResourceId(addr, tfEnv);
            let remoteExists = false;
            if (stateId) {
              try {
                const checkUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
                  accountId,
                )}/access/identity_providers/${encodeURIComponent(stateId)}`;
                const chk = (await fetchJson(checkUrl, token)) as any;
                remoteExists = !!(chk && chk.success === true && chk.result && chk.result.id);
              } catch {
                remoteExists = false;
              }
            }
            if (!remoteExists) {
              console.log(`[cf-auto-import] State has ${addr} but remote missing; removing from state`);
              await stateRm(addr, tfEnv);
            } else {
              console.log(`[cf-auto-import] Skip import (already managed): ${addr}`);
            }
          }
          if (!(await isManaged(addr, tfEnv))) {
            const importId = `accounts/${accountId}/${idpId}`;
            console.log(`[cf-auto-import] Import ${addr} <- ${importId}`);
            await runImport(addr, importId, tfEnv);
          }
        } else {
          console.log('[cf-auto-import] No existing Identity Provider found');
        }
      }
    }
  } catch (e) {
    console.error(`[cf-auto-import] IDP import skipped: ${(e as Error).message}`);
  }

  // 4) Try Reusable Access Policy import
  try {
    const cdkPath = path.join('cdktf.out', 'stacks', CLOUDFLARE_STACK_ID, 'cdk.tf.json');
    const cdkRaw = readFileSafe(cdkPath);
    if (cdkRaw) {
      const cdk = JSON.parse(cdkRaw);
      const key = findAccessPolicyKey(cdk);
      if (key) {
        if (!allowedEmailDomain) {
          console.log('[cf-auto-import] Skip policy import: allowed_email_domain missing');
          return;
        }
        const addr = `cloudflare_zero_trust_access_policy.${key}`;
        const tfEnv: Record<string, string> = {
          TF_VAR_cloudflare_api_token: token,
          TF_VAR_cloudflare_account_id: accountId,
          TF_VAR_domain_name: domain,
          TF_VAR_subdomain_name: subdomain,
          ...(targetIpAddress ? { TF_VAR_target_ip_address: targetIpAddress } : {}),
          ...(googleClientId ? { TF_VAR_google_client_id: googleClientId } : {}),
          ...(googleClientSecret ? { TF_VAR_google_client_secret: googleClientSecret } : {}),
          ...(allowedEmailDomain ? { TF_VAR_allowed_email_domain: allowedEmailDomain } : {}),
        };
        // Lookup policy by name
        const wantName = getAccessPolicyName(allowedEmailDomain);
        const polUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(accountId)}/access/policies`;
        const resp = (await fetchJson(polUrl, token)) as {
          success?: boolean;
          result?: Array<{ id?: string; name?: string }>;
        };
        const candidates = Array.isArray(resp?.result) ? resp.result : [];
        const match = candidates.find(r => (r?.name || '').toLowerCase() === wantName.toLowerCase());
        const policyId = match?.id;
        if (policyId) {
          if (await isManaged(addr, tfEnv)) {
            const stateId = await getStateResourceId(addr, tfEnv);
            let remoteExists = false;
            if (stateId) {
              try {
                const checkUrl = `https://api.cloudflare.com/client/v4/accounts/${encodeURIComponent(
                  accountId,
                )}/access/policies/${encodeURIComponent(stateId)}`;
                const chk = (await fetchJson(checkUrl, token)) as any;
                remoteExists = !!(chk && chk.success === true && chk.result && chk.result.id);
              } catch {
                remoteExists = false;
              }
            }
            if (!remoteExists) {
              console.log(`[cf-auto-import] State has ${addr} but remote missing; removing from state`);
              await stateRm(addr, tfEnv);
            } else {
              console.log(`[cf-auto-import] Skip import (already managed): ${addr}`);
            }
          }
          if (!(await isManaged(addr, tfEnv))) {
            const importId = `accounts/${accountId}/${policyId}`;
            console.log(`[cf-auto-import] Import ${addr} <- ${importId}`);
            await runImport(addr, importId, tfEnv);
          }
        } else {
          console.log('[cf-auto-import] No existing Access Policy found');
        }
      }
    }
  } catch (e) {
    console.error(`[cf-auto-import] Policy import skipped: ${(e as Error).message}`);
  }
}

// Optional CLI entry for manual invocation (not used from main.ts)
if (require.main === module) {
  runCfAutoImport().catch(e => {
    console.error(`[cf-auto-import] Error: ${(e as Error).message}`);
    // linter方針に従い、exitCode を設定して異常終了を示す
    process.exitCode = 1;
  });
}
