import { DataCloudflareZones } from '@cdktf/provider-cloudflare/lib/data-cloudflare-zones';
import { DnsRecord } from '@cdktf/provider-cloudflare/lib/dns-record';
import { TerraformOutput } from 'cdktf';
import { Construct } from 'constructs';

export interface ZoneSubdomainProps {
  domainName: string;
  subdomainName: string;
  targetIpAddress: string;
  proxied?: boolean;
  environment: string;
}

export class ZoneSubdomain extends Construct {
  public readonly record: DnsRecord;
  public readonly fullDomainName: string;

  constructor(scope: Construct, id: string, props: ZoneSubdomainProps) {
    super(scope, id);

    this.fullDomainName = `${props.subdomainName}.${props.domainName}`;

    // ゾーン情報を取得
    const zone = new DataCloudflareZones(this, 'zone', {
      name: props.domainName,
    });

    // サブドメインの A レコードを作成
    this.record = new DnsRecord(this, 'record', {
      zoneId: zone.result.get(0).id,
      ttl: 1,
      name: props.subdomainName,
      type: 'A',
      content: props.targetIpAddress,
      proxied: props.proxied ?? false,
      comment: `CDKTF により作成（環境: ${props.environment}）`,
    });

    // 出力
    new TerraformOutput(this, 'subdomain_url', {
      value: `https://${this.fullDomainName}`,
      description: '作成されたサブドメインのURL',
    });

    new TerraformOutput(this, 'record_id', {
      value: this.record.id,
      description: 'Cloudflare レコードID',
    });
  }
}
