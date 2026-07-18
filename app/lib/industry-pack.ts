import type { IndustryPack, ParameterDefinition, PriceBookItem } from "./models";

const common: ParameterDefinition[] = [
  { id: "targetAudience", label: "目标人群", dataType: "text", required: true },
  { id: "cityCount", label: "覆盖城市", dataType: "number", unit: "个", required: true },
  {
    id: "reportDepth",
    label: "报告深度",
    dataType: "singleSelect",
    required: true,
    options: [
      { label: "基础版", value: "basic" },
      { label: "标准版", value: "standard" },
      { label: "深度版", value: "deep" },
    ],
  },
];

export const researchIndustryPack: IndustryPack = {
  id: "research-industry",
  name: "调研行业包",
  version: 1,
  terminology: {
    focus_group: "焦点小组/座谈会",
    sample: "有效样本",
    incidenceRate: "目标人群筛选通过率",
  },
  projectTypes: [
    {
      id: "quantitative_online",
      name: "线上定量研究",
      shortDescription: "问卷、样本与数据分析的一体化测算",
      accent: "#4969f5",
      parameters: [
        { id: "sampleSize", label: "有效样本量", dataType: "number", unit: "份", required: true },
        {
          id: "incidenceRate",
          label: "目标人群筛选通过率",
          description: "每 100 名被筛选者中预计符合项目条件的人数",
          dataType: "percentage",
          unit: "%",
          required: true,
        },
        { id: "questionnaireMinutes", label: "问卷时长", dataType: "number", unit: "分钟", required: true },
        ...common,
      ],
    },
    {
      id: "in_depth_interview",
      name: "深度访谈",
      shortDescription: "招募、礼金、主持与研究报告的完整预算",
      accent: "#00a785",
      parameters: [
        { id: "interviewCount", label: "访谈人数", dataType: "number", unit: "人", required: true },
        { id: "sessionDurationMinutes", label: "单场时长", dataType: "number", unit: "分钟", required: true },
        {
          id: "recruitmentDifficulty",
          label: "招募难度",
          dataType: "singleSelect",
          required: true,
          options: [
            { label: "普通大众", value: "general" },
            { label: "特定品牌或行为人群", value: "specific" },
            { label: "高价值或稀缺人群", value: "rare" },
          ],
        },
        { id: "transcriptRequired", label: "需要逐字稿", dataType: "boolean", required: false },
        ...common,
      ],
    },
    {
      id: "focus_group",
      name: "焦点小组/座谈会",
      shortDescription: "按场次、参会人数和场地要求精细测算",
      accent: "#f08a41",
      parameters: [
        { id: "sessionCount", label: "座谈会场次数", dataType: "number", unit: "场", required: true },
        { id: "participantsPerSession", label: "每场参会人数", dataType: "number", unit: "人", required: true },
        { id: "backupParticipantsPerSession", label: "每场备用人数", dataType: "number", unit: "人", required: false },
        { id: "sessionDurationMinutes", label: "单场时长", dataType: "number", unit: "分钟", required: true },
        {
          id: "recruitmentDifficulty",
          label: "招募难度",
          dataType: "singleSelect",
          required: true,
          options: [
            { label: "普通大众", value: "general" },
            { label: "特定品牌或行为人群", value: "specific" },
            { label: "高价值或稀缺人群", value: "rare" },
          ],
        },
        {
          id: "deliveryMode",
          label: "执行方式",
          dataType: "singleSelect",
          required: true,
          options: [
            { label: "线下座谈会", value: "offline" },
            { label: "线上焦点小组", value: "online" },
            { label: "混合执行", value: "hybrid" },
          ],
        },
        { id: "transcriptRequired", label: "需要逐字稿", dataType: "boolean", required: false },
        ...common,
      ],
    },
    {
      id: "mixed_research",
      name: "综合研究项目",
      shortDescription: "定量与定性模块组合报价",
      accent: "#7d58d6",
      parameters: [
        { id: "sampleSize", label: "定量样本量", dataType: "number", unit: "份", required: true },
        { id: "interviewCount", label: "深访人数", dataType: "number", unit: "人", required: true },
        ...common,
      ],
    },
  ],
};

export const defaultPriceBook: PriceBookItem[] = [
  { id: "design", name: "研究设计", unit: "项", costUnitPriceCents: 300000, suggestedSaleUnitPriceCents: 500000, applicableProjectTypes: ["quantitative_online", "in_depth_interview", "focus_group", "mixed_research"], sensitive: false },
  { id: "sample", name: "样本执行", unit: "份", costUnitPriceCents: 1800, suggestedSaleUnitPriceCents: 3000, applicableProjectTypes: ["quantitative_online", "mixed_research"], sensitive: true },
  { id: "recruit", name: "受访者招募", unit: "人", costUnitPriceCents: 22000, suggestedSaleUnitPriceCents: 35000, applicableProjectTypes: ["in_depth_interview", "focus_group", "mixed_research"], sensitive: true },
  { id: "incentive", name: "用户礼金", unit: "人", costUnitPriceCents: 30000, suggestedSaleUnitPriceCents: 30000, applicableProjectTypes: ["in_depth_interview", "focus_group", "mixed_research"], sensitive: true },
  { id: "moderation", name: "主持与执行", unit: "场", costUnitPriceCents: 180000, suggestedSaleUnitPriceCents: 300000, applicableProjectTypes: ["in_depth_interview", "focus_group"], sensitive: true },
  { id: "venue", name: "场地与设备", unit: "场", costUnitPriceCents: 250000, suggestedSaleUnitPriceCents: 350000, applicableProjectTypes: ["focus_group"], sensitive: true },
  { id: "transcript", name: "录音与逐字稿", unit: "场", costUnitPriceCents: 50000, suggestedSaleUnitPriceCents: 80000, applicableProjectTypes: ["in_depth_interview", "focus_group"], sensitive: false },
  { id: "analysis", name: "分析与报告", unit: "项", costUnitPriceCents: 800000, suggestedSaleUnitPriceCents: 1400000, applicableProjectTypes: ["quantitative_online", "in_depth_interview", "focus_group", "mixed_research"], sensitive: false },
];
