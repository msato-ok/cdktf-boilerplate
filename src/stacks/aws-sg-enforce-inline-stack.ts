import { AwsProvider } from '@cdktf/provider-aws/lib/provider';
import { SecurityGroup, SecurityGroupIngress } from '@cdktf/provider-aws/lib/security-group';
import { DataHttp } from '@cdktf/provider-http/lib/data-http';
import { HttpProvider } from '@cdktf/provider-http/lib/provider';
import { Fn, TerraformOutput, TerraformStack, TerraformVariable, VariableType } from 'cdktf';
import { Construct } from 'constructs';

export class AwsSgEnforceInlineStack extends TerraformStack {
  constructor(scope: Construct, id: string) {
    super(scope, id);

    // 変数定義（任意上書き用）。未設定/空リストならHTTP取得結果を使用
    const cfIpv4CidrsVar = new TerraformVariable(this, 'cf_ipv4_cidrs', {
      type: VariableType.LIST_STRING,
      description: 'Cloudflare IPv4 CIDR リスト（未設定なら自動取得）',
      default: [],
    });
    const cfIpv6CidrsVar = new TerraformVariable(this, 'cf_ipv6_cidrs', {
      type: VariableType.LIST_STRING,
      description: 'Cloudflare IPv6 CIDR リスト（未設定なら自動取得）',
      default: [],
    });

    new AwsProvider(this, 'aws', { region: process.env.AWS_REGION || 'ap-northeast-1' });

    // HTTP プロバイダー（Cloudflare 公開IPレンジを取得）
    new HttpProvider(this, 'http');
    const cfV4 = new DataHttp(this, 'cf_ips_v4', {
      url: 'https://www.cloudflare.com/ips-v4',
    });
    const cfV6 = new DataHttp(this, 'cf_ips_v6', {
      url: 'https://www.cloudflare.com/ips-v6',
    });

    // 正規化: trimspace -> split("\n") -> compact -> distinct -> sort
    const cfV4List = Fn.sort(Fn.distinct(Fn.compact(Fn.split('\n', Fn.trimspace(cfV4.responseBody)))));
    const cfV6List = Fn.sort(Fn.distinct(Fn.compact(Fn.split('\n', Fn.trimspace(cfV6.responseBody)))));

    // 実際に使用するリスト: var が非空なら var を優先、空なら HTTP 結果
    const effectiveIpv4 = Fn.coalescelist([cfIpv4CidrsVar.listValue, cfV4List]);
    const effectiveIpv6 = Fn.coalescelist([cfIpv6CidrsVar.listValue, cfV6List]);

    const descPrefix = 'Allow Cloudflare';

    const ingress: SecurityGroupIngress[] = [];

    // ポートは 80 のみ（HTTPサーバー用）
    ingress.push({
      protocol: 'tcp',
      fromPort: 80,
      toPort: 80,
      cidrBlocks: effectiveIpv4,
      ipv6CidrBlocks: effectiveIpv6,
      description: `${descPrefix} 80`,
    });

    // 既存SGをインライン管理: 上で定義したIngressの集合を正として厳格適用
    const sg = new SecurityGroup(this, 'managed_sg', {
      // name/vpcId は import 時は任意（プロバイダが取得）
      vpcId: undefined,
      revokeRulesOnDelete: true,
      ingress,
      egress: [], // ここではEgressを管理しない（広い許可を避けるため空）
    });

    // 重要: 既存 SG は削除しない（ルールのみを管理）
    // destroy 時や ID 変更時に SG 自体の削除を試みないよう保護
    sg.addOverride('lifecycle.prevent_destroy', true);
    // SG の作成時属性（name/description など）差分による置換を防止
    sg.addOverride('lifecycle.ignore_changes', ['name', 'name_prefix', 'description', 'tags_all']);

    // 既存SGをインポートし、Terraform 管理下に置く
    const sgId = process.env.SG_ID; // import はトークン不可のため、環境変数で指定
    if (!sgId) {
      throw new Error('SG_ID が未設定です。既存のセキュリティグループを import するために必要です。');
    }
    sg.importFrom(sgId);

    new TerraformOutput(this, 'managed_sg_id', { value: sgId });
    new TerraformOutput(this, 'ingress_rule_count', { value: ingress.length.toString() });
  }
}
