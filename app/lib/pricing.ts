import { defaultPriceBook } from "./industry-pack";
import type { CostOverride, ManualCostItem, PriceBookConfig, QuoteLine, QuoteProject, QuoteTotals, ResearchProjectTypeId } from "./models";

const numberValue = (value: unknown, fallback = 0) => {
  const result = Number(value);
  return Number.isFinite(result) ? result : fallback;
};

const factorFor = (value: unknown, factors: Record<string, number>, fallback = 10000) => factors[String(value)] ?? fallback;
const included = (value: unknown, legacy = false) => value === "quoted" || (value === undefined && legacy);

const serviceLine = (
  priceBook: PriceBookConfig,
  id: string,
  quantity: number,
  detail: string,
  saleFactorBasisPoints = 10000,
  lineId?: string,
): QuoteLine => {
  const item = priceBook.items.find((entry) => entry.id === id) ?? defaultPriceBook.items.find((entry) => entry.id === id);
  if (!item) throw new Error(`Missing price book item: ${id}`);
  const saleUnitPriceCents = Math.round((item.suggestedSaleUnitPriceCents * saleFactorBasisPoints) / 10000);
  return {
    id: lineId ?? id,
    name: item.name,
    detail,
    quantity,
    unit: item.unit,
    costUnitPriceCents: item.costUnitPriceCents,
    saleUnitPriceCents,
    saleUnitPriceMinCents: Math.round((item.saleUnitPriceMinCents * saleFactorBasisPoints) / 10000),
    saleUnitPriceMaxCents: Math.round((item.saleUnitPriceMaxCents * saleFactorBasisPoints) / 10000),
    costAmountCents: Math.round(quantity * item.costUnitPriceCents),
    saleAmountCents: Math.round(quantity * saleUnitPriceCents),
    customerVisible: true,
    source: "rule",
  };
};

export function calculateLines(
  type: ResearchProjectTypeId,
  parameters: QuoteProject["parameters"],
  priceBook: PriceBookConfig = defaultPriceBook,
  costOverrides: Record<string, CostOverride> = {},
  manualCosts: ManualCostItem[] = [],
): QuoteLine[] {
  const selectedMethods = Array.isArray(parameters.qualitativeMethods) ? parameters.qualitativeMethods : [];
  const rushFactor = factorFor(parameters.rushLevel, { normal: 10000, rush: 11500, urgent: 13500 });
  const recruitmentFactor = factorFor(parameters.recruitmentDifficulty, { general: 10000, specific: 13000, rare: 18000 });
  const includesOnlineQuant = type === "quantitative_online" || (type === "mixed_research" && (selectedMethods.includes("quantitative_online") || (selectedMethods.length === 0 && numberValue(parameters.sampleSize) > 0)));
  const includesDepthInterview = type === "in_depth_interview" || (type === "mixed_research" && selectedMethods.includes("in_depth_interview"));
  const includesFocusGroup = type === "focus_group" || (type === "mixed_research" && selectedMethods.includes("focus_group"));
  const includesExpertInterview = type === "expert_interview" || (type === "mixed_research" && selectedMethods.includes("expert_interview"));
  const includesDeskResearch = type === "desk_research" || (type === "mixed_research" && selectedMethods.includes("desk_research"));
  const lines: QuoteLine[] = [serviceLine(priceBook, "design", 1, "固定研究设计费用", rushFactor)];

  if (includesOnlineQuant) {
    const samples = numberValue(parameters.sampleSize);
    const provinces = Math.max(1, numberValue(parameters.provinceCount, numberValue(parameters.cityCount, 1)));
    const incidence = Math.max(numberValue(parameters.incidenceRate, 50), 5);
    const incidenceFactor = Math.min(Math.round((100 / incidence) * 10000), 40000);
    const lengthFactor = numberValue(parameters.questionnaireMinutes, 12) > 20 ? 13000 : numberValue(parameters.questionnaireMinutes, 12) > 12 ? 11500 : 10000;
    const questionnaireFactor = factorFor(parameters.questionnaireComplexity, { simple: 9500, standard: 10000, complex: 12500 });
    const quotaFactor = factorFor(parameters.quotaComplexity, { simple: 10000, standard: 11500, complex: 13500 });
    const sampleFactor = Math.round(incidenceFactor * lengthFactor / 10000 * questionnaireFactor / 10000 * quotaFactor / 10000 * rushFactor / 10000);
    lines.push(serviceLine(priceBook, "sample", samples, `${samples} 份、覆盖 ${provinces} 个省份 × 单价 × 筛选/时长/配额/加急系数`, sampleFactor));
  }

  if (type === "quantitative_offline") {
    const samples = numberValue(parameters.sampleSize);
    const cities = Math.max(1, numberValue(parameters.cityCount, 1));
    const executionDays = Math.max(1, numberValue(parameters.executionDays, 1));
    const interviewers = Math.max(1, numberValue(parameters.interviewerCount, 1));
    const methodFactor = factorFor(parameters.offlineMethod, { intercept: 10000, home_visit: 13500, store_visit: 11500, telephone: 9000, product_test: 14500 });
    lines.push(serviceLine(priceBook, "offline_execution", samples, `${samples} 份 × 访问执行单价 × 方式/加急系数`, Math.round(methodFactor * rushFactor / 10000)));
    lines.push(serviceLine(priceBook, "interviewer", executionDays * interviewers, `${interviewers} 人 × ${executionDays} 天访问员执行`, rushFactor));
    lines.push(serviceLine(priceBook, "field_supervision", cities, `${cities} 个城市 × 现场督导`, rushFactor));
    lines.push(serviceLine(priceBook, "data_entry", samples, `${samples} 份 × 数据录入与质检`));
    if (included(parameters.incentiveResponsibility)) lines.push(serviceLine(priceBook, "incentive", samples, `${samples} 人 × 用户礼金`));
    if (included(parameters.venueResponsibility)) lines.push(serviceLine(priceBook, "venue", cities, `${cities} 个城市 × 场地与设备`));
  }

  if (includesDepthInterview) {
    const count = numberValue(parameters.interviewCount);
    const suffix = type === "mixed_research" ? "_interview" : "";
    lines.push(serviceLine(priceBook, "recruit", count, `深访：${count} 人 × 单价 × 招募/加急系数`, Math.round(recruitmentFactor * rushFactor / 10000), `recruit${suffix}`));
    if (included(parameters.incentiveResponsibility, true)) lines.push(serviceLine(priceBook, "incentive", count, `深访：${count} 人 × 礼金`, 10000, `incentive${suffix}`));
    lines.push(serviceLine(priceBook, "moderation", count, `深访：${count} 场 × 主持执行`, rushFactor, `moderation${suffix}`));
  }

  if (includesFocusGroup) {
    const sessions = numberValue(parameters.sessionCount);
    const participants = numberValue(parameters.participantsPerSession) + numberValue(parameters.backupParticipantsPerSession);
    const people = sessions * participants;
    const suffix = type === "mixed_research" ? "_focus" : "";
    lines.push(serviceLine(priceBook, "recruit", people, `座谈会：${sessions} 场 × ${participants} 人 × 招募/加急系数`, Math.round(recruitmentFactor * rushFactor / 10000), `recruit${suffix}`));
    if (included(parameters.incentiveResponsibility, true)) lines.push(serviceLine(priceBook, "incentive", people, `座谈会：${people} 人 × 礼金`, 10000, `incentive${suffix}`));
    lines.push(serviceLine(priceBook, "moderation", sessions, `座谈会：${sessions} 场 × 主持执行`, rushFactor, `moderation${suffix}`));
    if (parameters.deliveryMode !== "online" && included(parameters.venueResponsibility, parameters.venueResponsibility === undefined)) lines.push(serviceLine(priceBook, "venue", sessions, `座谈会：${sessions} 场 × 场地设备`, 10000, `venue${suffix}`));
    if (included(parameters.observationResponsibility)) lines.push(serviceLine(priceBook, "observation_room", sessions, `${sessions} 场 × 观察室/单面镜`, 10000, `observation${suffix}`));
    if (included(parameters.liveStreamingResponsibility)) lines.push(serviceLine(priceBook, "live_streaming", sessions, `${sessions} 场 × 远程直播`, 10000, `streaming${suffix}`));
    if (included(parameters.translationResponsibility)) lines.push(serviceLine(priceBook, "translation", sessions, `${sessions} 场 × 翻译/同传`, 10000, `translation${suffix}`));
  }

  if (includesExpertInterview) {
    const count = numberValue(parameters.expertCount);
    const scarcity = factorFor(parameters.expertScarcity, { standard: 10000, scarce: 15000, rare: 20000 });
    const level = factorFor(parameters.expertLevel, { manager: 10000, director: 13000, executive: 17000 });
    const expertFactor = Math.round(scarcity * level / 10000 * rushFactor / 10000);
    lines.push(serviceLine(priceBook, "expert_recruit", count, `专家访谈：${count} 人 × 招募单价 × 职级/稀缺度`, expertFactor, "expert_recruit"));
    if (included(parameters.expertHonorariumResponsibility, true)) lines.push(serviceLine(priceBook, "expert_honorarium", count, `专家访谈：${count} 人 × 专家礼金`, expertFactor, "expert_honorarium"));
    lines.push(serviceLine(priceBook, "moderation", count, `专家访谈：${count} 场 × 访谈执行`, rushFactor, "moderation_expert"));
  }

  if (includesDeskResearch) {
    const sourceCount = Math.max(1, numberValue(parameters.sourceCount, 20));
    lines.push(serviceLine(priceBook, "desk_sources", sourceCount, `${sourceCount} 个信息源 × 检索与整理`, rushFactor));
    if (included(parameters.databaseResponsibility, type === "mixed_research")) lines.push(serviceLine(priceBook, "database_access", 1, "行业数据库与数据购买预留"));
    if (type === "desk_research" && parameters.expertSupplement) {
      const expertCount = Math.max(1, numberValue(parameters.expertSupplementCount, 1));
      const expertFactor = factorFor(parameters.expertScarcity, { standard: 10000, scarce: 15000, rare: 20000 });
      lines.push(serviceLine(priceBook, "expert_recruit", expertCount, `桌面研究补充：${expertCount} 名专家招募`, expertFactor, "desk_expert_recruit"));
      lines.push(serviceLine(priceBook, "expert_honorarium", expertCount, `桌面研究补充：${expertCount} 名专家礼金`, expertFactor, "desk_expert_honorarium"));
      lines.push(serviceLine(priceBook, "moderation", expertCount, `桌面研究补充：${expertCount} 场专家访谈执行`, rushFactor, "desk_expert_moderation"));
    }
  }

  const interviewSessions = includesDepthInterview ? numberValue(parameters.interviewCount) : 0;
  const focusSessions = includesFocusGroup ? numberValue(parameters.sessionCount) : 0;
  const expertSessions = includesExpertInterview ? numberValue(parameters.expertCount) : 0;
  const qualitativeSessions = interviewSessions + focusSessions + expertSessions;
  if (qualitativeSessions > 0 && included(parameters.recordingResponsibility)) lines.push(serviceLine(priceBook, "recording", qualitativeSessions, `${qualitativeSessions} 场 × 专业录音录像`));
  if (qualitativeSessions > 0 && included(parameters.transcriptResponsibility, Boolean(parameters.transcriptRequired))) lines.push(serviceLine(priceBook, "transcript", qualitativeSessions, `${qualitativeSessions} 场 × 录音与逐字稿`));
  if (included(parameters.travelResponsibility)) lines.push(serviceLine(priceBook, "travel", 1, "异地执行差旅预留"));

  if (parameters.reportDepth !== "none") {
    for (const role of priceBook.laborRoles) {
      const days = numberValue(parameters[`laborDays_${role.id}`]);
      if (days <= 0) continue;
      lines.push({
        id: `labor_${role.id}`,
        name: `${role.name}研究工时`,
        detail: `${days} 人天 × ${formatMoney(role.suggestedSalePerDayCents)}/人天`,
        quantity: days,
        unit: "人天",
        costUnitPriceCents: role.costPerDayCents,
        saleUnitPriceCents: role.suggestedSalePerDayCents,
        saleUnitPriceMinCents: role.salePerDayMinCents,
        saleUnitPriceMaxCents: role.salePerDayMaxCents,
        costAmountCents: Math.round(days * role.costPerDayCents),
        saleAmountCents: Math.round(days * role.suggestedSalePerDayCents),
        customerVisible: true,
        source: "rule",
      });
    }
  }

  const adjusted = lines.map((item) => {
    if (item.id.startsWith("labor_")) return item;
    const override = costOverrides[item.id];
    if (!override) return item;
    return { ...item, costUnitPriceCents: override.costUnitPriceCents, costAmountCents: Math.round(item.quantity * override.costUnitPriceCents), costOverrideReason: override.reason };
  });
  const manualLines = manualCosts.map((item): QuoteLine => {
    const saleUnitPriceCents = item.pricingMode === "internal_only" ? 0 : item.pricingMode === "pass_through" ? item.costUnitPriceCents : item.pricingMode === "markup" ? Math.round(item.costUnitPriceCents * (10000 + item.markupBasisPoints) / 10000) : item.saleUnitPriceCents;
    return { id: item.id, name: item.name, detail: item.note || ({ internal_only: "仅计入内部成本", pass_through: "成本原价转嫁", fixed: "按指定单价报价", markup: `成本加价 ${(item.markupBasisPoints / 100).toFixed(0)}%` }[item.pricingMode]), quantity: item.quantity, unit: item.unit, costUnitPriceCents: item.costUnitPriceCents, saleUnitPriceCents, costAmountCents: Math.round(item.quantity * item.costUnitPriceCents), saleAmountCents: Math.round(item.quantity * saleUnitPriceCents), customerVisible: item.pricingMode !== "internal_only", source: "manual" };
  });
  return [...adjusted, ...manualLines];
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
  if (project.projectTypeId !== "desk_research" && !project.parameters.targetAudience) risks.push("目标人群尚未说明，执行或招募成本可能偏差");
  if (totals.marginBasisPoints < project.minimumMarginBasisPoints) risks.push("当前报价低于最低毛利率红线");
  if ((project.projectTypeId === "quantitative_online" || project.projectTypeId === "mixed_research") && numberValue(project.parameters.incidenceRate, 50) < 15) risks.push("筛选通过率较低，建议预留样本获取风险");
  if ((project.projectTypeId === "focus_group" || project.projectTypeId === "mixed_research") && project.parameters.deliveryMode !== "online" && !project.parameters.venueResponsibility) risks.push("请确认场地、设备与异地差旅由哪一方承担");
  if (numberValue(project.parameters.projectCycleDays, 30) < 10 || project.parameters.rushLevel === "urgent") risks.push("项目周期较紧，建议确认加急资源和交付边界");
  if (!project.parameters.reportDepth) risks.push("请确认是否需要报告以及报告深度");
  if (project.projectTypeId === "mixed_research" && (!Array.isArray(project.parameters.qualitativeMethods) || project.parameters.qualitativeMethods.length === 0)) risks.push("综合研究至少需要选择一个研究模块");
  if (project.parameters.reportDepth !== "none" && !project.lines.some((line) => line.id.startsWith("labor_"))) risks.push("已选择报告，但尚未填写研究人员投入人天");
  return risks;
}

export const formatMoney = (cents: number) => new Intl.NumberFormat("zh-CN", { style: "currency", currency: "CNY", maximumFractionDigits: 0 }).format(cents / 100);
