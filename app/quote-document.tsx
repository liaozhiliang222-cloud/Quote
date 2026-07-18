import type { ProjectTypeDefinition, QuoteProject } from "./lib/models";
import { calculateTotals, formatMoney } from "./lib/pricing";
import type { ExportMode } from "./lib/exports";

export function QuoteDocument({ project, typeDefinition, mode }: { project: QuoteProject; typeDefinition: ProjectTypeDefinition; mode: ExportMode }) {
  const totals = calculateTotals(project);
  const lines = mode === "customer" ? project.lines.filter((line) => line.customerVisible) : project.lines;
  return (
    <article className={`print-document print-${mode}`}>
      <header><div className="print-brand"><i>研</i><div><strong>研价</strong><span>调研报价助手</span></div></div><span>{mode === "customer" ? "客户报价单" : "内部成本测算单"}</span></header>
      <section className="print-title"><p>{typeDefinition.name}</p><h1>{project.name}</h1><div><span>报价版本 V{project.quoteVersion ?? 1}</span><span>报价日期 {new Date().toLocaleDateString("zh-CN")}</span><span>有效期 {project.validityDays ?? 30} 天</span></div></section>
      <section className="print-summary"><div><span>含税报价</span><strong>{formatMoney(totals.totalCents)}</strong></div><div><span>未税报价</span><b>{formatMoney(totals.preTaxCents)}</b></div><div><span>税费</span><b>{formatMoney(totals.taxCents)}</b></div>{mode === "internal" && <><div><span>预计成本</span><b>{formatMoney(totals.costCents)}</b></div><div><span>毛利率</span><b>{(totals.marginBasisPoints / 100).toFixed(1)}%</b></div></>}</section>
      <section className="print-section"><h2>{mode === "customer" ? "服务范围与报价" : "成本与报价明细"}</h2><table><thead><tr><th>服务项目</th><th>计价说明</th><th>数量</th><th>单位</th>{mode === "internal" && <><th>成本</th><th>单位成本</th></>}<th>对外金额</th></tr></thead><tbody>{lines.map((line) => <tr key={line.id}><td>{line.name}</td><td>{line.detail}</td><td>{line.quantity}</td><td>{line.unit}</td>{mode === "internal" && <><td>{formatMoney(line.costAmountCents)}</td><td>{formatMoney(line.costUnitPriceCents)}</td></>}<td>{formatMoney(line.saleAmountCents)}</td></tr>)}</tbody></table></section>
      <section className="print-total"><div><span>未税合计</span><b>{formatMoney(totals.preTaxCents)}</b></div><div><span>税费（{project.taxRateBasisPoints / 100}%）</span><b>{formatMoney(totals.taxCents)}</b></div><div className="grand"><span>含税总价</span><strong>{formatMoney(totals.totalCents)}</strong></div>{mode === "internal" && <><div><span>毛利额</span><b>{formatMoney(totals.marginCents)}</b></div><div><span>最低安全价（未税）</span><b>{formatMoney(totals.minimumSafePriceCents)}</b></div></>}</section>
      <section className="print-terms"><h2>商务说明</h2><p>{project.businessTerms || "本报价有效期内有效；超出约定服务范围的需求、异地差旅及第三方采购费用如未列明，将另行评估。"}</p></section>
      <footer><span>本报价由研价 · 调研报价助手生成</span><span>{mode === "internal" ? "内部资料，请勿对外发送" : "感谢您的信任"}</span></footer>
    </article>
  );
}
