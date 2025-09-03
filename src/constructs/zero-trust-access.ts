import { ZeroTrustAccessApplication } from '@cdktf/provider-cloudflare/lib/zero-trust-access-application';
import { ZeroTrustAccessIdentityProvider } from '@cdktf/provider-cloudflare/lib/zero-trust-access-identity-provider';
import { ZeroTrustAccessPolicy } from '@cdktf/provider-cloudflare/lib/zero-trust-access-policy';
import { TerraformOutput } from 'cdktf';
import { Construct } from 'constructs';
import { getAccessAppName, getAccessPolicyName, getIdentityProviderName } from '../cloudflare/utils';

export interface ZeroTrustAccessProps {
  accountId: string;
  domainName: string;
  subdomainName: string;
  googleClientId: string;
  googleClientSecret: string;
  allowedEmailDomain: string;
  environment: string;
}

export class ZeroTrustAccess extends Construct {
  public readonly application: ZeroTrustAccessApplication;
  public readonly policy: ZeroTrustAccessPolicy;
  public readonly identityProvider: ZeroTrustAccessIdentityProvider;

  constructor(scope: Construct, id: string, props: ZeroTrustAccessProps) {
    super(scope, id);

    const fullDomainName = `${props.subdomainName}.${props.domainName}`;

    // Google ID プロバイダーを作成
    this.identityProvider = new ZeroTrustAccessIdentityProvider(this, 'google_idp', {
      accountId: props.accountId,
      name: getIdentityProviderName(props.subdomainName, props.domainName),
      type: 'google',
      config: {
        clientId: props.googleClientId,
        clientSecret: props.googleClientSecret,
      },
    });

    // 指定メールドメインを許可する再利用可能ポリシーを作成
    this.policy = new ZeroTrustAccessPolicy(this, 'policy', {
      accountId: props.accountId,
      name: getAccessPolicyName(props.allowedEmailDomain),
      decision: 'allow',
      include: [
        {
          emailDomain: {
            domain: props.allowedEmailDomain,
          },
        },
      ],
      require: [
        {
          loginMethod: {
            id: this.identityProvider.id,
          },
        },
      ],
    });

    // Access アプリケーションを作成（既存は CI の自動 import で採用）
    this.application = new ZeroTrustAccessApplication(this, 'application', {
      accountId: props.accountId,
      name: getAccessAppName(props.subdomainName, props.domainName, props.environment),
      domain: fullDomainName,
      type: 'self_hosted',
      sessionDuration: '24h',
      autoRedirectToIdentity: false,
      enableBindingCookie: false,
      appLauncherVisible: true,
      allowedIdps: [this.identityProvider.id],
      policies: [
        {
          id: this.policy.id,
        },
      ],
      dependsOn: [this.identityProvider, this.policy],
    });

    // 出力
    new TerraformOutput(this, 'application_id', {
      value: this.application.id,
      description: 'Cloudflare Access アプリケーションID',
    });

    new TerraformOutput(this, 'application_domain', {
      value: this.application.domain,
      description: '保護対象ドメイン',
    });

    new TerraformOutput(this, 'policy_id', {
      value: this.policy.id,
      description: 'Access ポリシーID',
    });

    new TerraformOutput(this, 'identity_provider_id', {
      value: this.identityProvider.id,
      description: 'Google ID プロバイダーID',
    });

    new TerraformOutput(this, 'cloudflare_ip_ranges_info', {
      value:
        'Cloudflare IP レンジは IaC 内で自動取得（HTTP データソース）されます。手動確認: https://www.cloudflare.com/ips/ 参照',
      description: 'ファイアウォール設定向けの Cloudflare IP レンジに関する補足情報',
    });
  }
}
