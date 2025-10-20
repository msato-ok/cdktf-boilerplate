import { App } from 'cdktf';
import { StaticContentStack, StaticSiteZoneStack, ensureAwsAuth } from '@minr-dev/cdktf-toolkit';
import { buildProjectConfig, buildBackendConfig } from '../config';
import { configureRemoteState } from '../shared/backend-helper';

/**
 * 静的サイト配信用インフラのデプロイフロー
 *
 * 静的サイト（HTML/CSS/JS）の配信基盤を構築:
 * 1. StaticContentStack: S3バケット、CloudFront、デプロイユーザー
 * 2. StaticSiteZoneStack: Cloudflare DNS設定（静的サイト用）
 */
export function deployStaticSite(app: App): { zoneId: string; zoneStack: StaticSiteZoneStack } {
  const projectConfig = buildProjectConfig();
  const { environment, staticSite } = projectConfig;
  console.log(`[Static Site] Environment: ${environment}`);

  // AWS認証確認
  ensureAwsAuth();

  // S3Backend設定
  const backendConfig = buildBackendConfig(environment, projectConfig.awsRegion);

  const staticSiteFqdn = `${staticSite.subDomain}.${staticSite.baseDomain}`;

  // 1. 静的サイト配信スタック（StaticContentStack）
  const staticContentStack = StaticContentStack.createWithCustomDomain(app, 'static-content-stack', {
    environment,
    awsRegion: projectConfig.awsRegion,
    bucketName: staticSite.bucketName,
    oacName: staticSite.oacName,
    deployUserName: staticSite.deployUserName,
    deployPolicyName: staticSite.deployPolicyName,
    customDomain: staticSiteFqdn,
    purposeTag: 'static-site',
  });
  configureRemoteState(staticContentStack, {
    ...backendConfig,
    stackId: 'static-content-stack',
  });

  // 2. 静的サイト用 Cloudflare Zone スタック（StaticSiteZoneStack）
  const staticSiteZoneStack = new StaticSiteZoneStack(app, 'static-site-zone-stack', {
    environment,
    domainName: staticSite.baseDomain,
    subDomainName: staticSite.subDomain,
    cloudfrontDomainName: staticContentStack.cloudfrontDomainName,
    acmValidationRecord: staticContentStack.acmValidationRecord,
  });
  configureRemoteState(staticSiteZoneStack, {
    ...backendConfig,
    stackId: 'static-site-zone-stack',
  });
  staticSiteZoneStack.addDependency(staticContentStack);

  // ZoneIDを返す（Jamstack APIデプロイで使用）
  return { zoneId: staticSiteZoneStack.zoneId, zoneStack: staticSiteZoneStack };
}
