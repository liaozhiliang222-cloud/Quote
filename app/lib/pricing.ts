import { defaultPriceBook } from "./industry-pack";
import type { QuoteLine, QuoteProject, QuoteTotals, ResearchProjectTypeId } from "./models";

const numberValue = (value: unknown, fallback = 0) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const price = (id: string) => defaultPriceBook.find((item) => item.id === id)!;

const line = (id: string, quantity: number, detail: string, saleFactorBasisPoints = 10000): QuoteLine => {
  const item = price(id);
  const saleUnitPriceCents = Math.round((item.suggestedSaleUnitPriceCents * saleFactorBasisPoints) / 10000);
  return {
    id,
    name: item.name,
    detail,
    quantity,
    unit: item.unit,
    costUnitPriceCents: item.costUnitPriceCents,
    saleUnitPriceCents,
    costAmountCents: Math.round(quantity * item.costUnitPriceCents),
    saleAmountCents: Math.round(quantity * saleUnitPriceCents),
    customerVisible: true,
  };
};

export function calculateLines(type: ResearchProjectTypeId, parameters: QuoteProject["parameters"]): QuoteLine[] {
  const reportFactor = parameters.reportDepth === "deep" ? 15000 : parameters.reportDepth === "standard" ? 11500 : 8500;
  const difficulty = parameters.recruitmentDifficulty === "rare" ? 18000 : parameters.recruitmentDifficulty === "specific" ? 13000 : 10000;
  const lines: QuoteLine[] = [line("design", 1, "固定费用")];

  if (type === "quantitative_online" || type === "mixed_research") {
    const samples = numberValue(parameters.sampleSize);
    const incidence = Math.max(numberValue(parameters.incidenceRate, 50), 5);
    const sampleFactor = Math.round((100 / incidence) * 10000);
    lines.push(line("sample", samples, `${samples} 份 × 单价 × 筛选难度系数`, Math.min(sampleFactor, 40000)));
  }

  if (type === "in_depth_interview" || type === "mixed_research") {
    const count = numberValue(parameters.interviewCount);
    lines.push(line("recruit", count, `${count} 人 × 单价 × 招募难度`, difficulty));
    lines.push(line("incentive", count, `${count} 人 × 礼金`));
    lines.push(line("moderation", count, `${count} 场 × 主持执行`));
  }

  if (type === "focus_group") {
    const sessions = numberValue(parameters.sessionCount);
    const participants = numberValue(parameters.participantsPerSession) + numberValue(parameters.backupParticipantsPerSession);
    const people = sessions * participants;
    lines.push(line("recruit", people, `${sessions} 场 × ${participants} 人 × 招募难度`, difficulty));
    lines.push(line("incentive", people, `${people} 人 × 礼金`));
    lines.push(line("moderation", sessions, `${sessions} 场 × 主持执行`));
    if (parameters.deliveryMode !== "online") lines.push(line("venue", sessions, `${sessions} 场 × 场地设备`));
  }

  if (parameters.transcriptRequired) {
    const sessions = type === "focus_group" ? numberValue(parameters.sessionCount) : numberValue(parameters.interviewCount);
    lines.push(line("transcript", sessions, `${sessions} 场 × 录音与逐字稿`));
  }
  lines.push(line("analysis", 1, "报告深度调整", reportFactor));
  return lines;
}

export function calculateTotals(project: QuoteProject): QuoteTotals {
  const costCents = project.lines.reduce((sum, item) => sum + item.costAmountCents, 0);
  const preTaxCents = project.lines.reduce((sum, item) => sum + item.saleAmountCents, 0);
  const taxCents = Math.round((preTaxCents * project.taxRateBasisPoints) / 10000);
  const totalCents = preTaxCents + taxCents;
  const marginCents = preTaxCents - costCents;
  const marginBasisPoints = preTaxCents ? Math.round((marginCents * 10000) / preTaxCents) : 0;
  const minimumSafePriceCents = Math.ceil((costCents * 10000) / Math.max(1, 10000 - project.minimumMarginBasisPoints));
  return { costCents, preTaxCents, taxCents, totalCents, marginCents, marginBasisPoints, minimumSafePriceCents };
}

export function getRisks(project: QuoteProject): string[] {
  const risks: string[] = [];
  const totals = calculateTotals(project);
  if (!project.parameters.targetAudience) risks.push("目标人群尚未说明，招募成本可能偏差");
  if (totals.marginBasisPoints < project.minimumMarginBasisPoints) risks.push("当前报价低于最低毛利率红线");
  if (project.projectTypeId === "quantitative_online" && numberValue(project.parameters.incidenceRate) < 15) risks.push("筛选通过率较低，建议预留样本获取风险");
  if (project.projectTypeId === "focus_group" && project.parameters.deliveryMode !== "online") risks.push("请确认场地、设备与异地差旅是否全部计入");
  if (!project.parameters.reportDepth) risks.push("报告深度未确认，交付范围存在风险");
  return risks;
}

export const formatMoney = (cents: number) =>
  new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(cents / 100);
