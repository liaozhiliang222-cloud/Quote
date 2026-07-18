export type ResearchProjectTypeId =
  | "quantitative_online"
  | "in_depth_interview"
  | "focus_group"
  | "mixed_research";

export type ParameterType =
  | "number"
  | "money"
  | "percentage"
  | "text"
  | "singleSelect"
  | "boolean";

export interface SelectOption {
  label: string;
  value: string;
}

export interface ParameterDefinition {
  id: string;
  label: string;
  description?: string;
  dataType: ParameterType;
  unit?: string;
  required: boolean;
  options?: SelectOption[];
}

export interface ProjectTypeDefinition {
  id: ResearchProjectTypeId;
  name: string;
  shortDescription: string;
  accent: string;
  parameters: ParameterDefinition[];
}

export interface IndustryPack {
  id: string;
  name: string;
  version: number;
  projectTypes: ProjectTypeDefinition[];
  terminology: Record<string, string>;
}

export interface PriceBookItem {
  id: string;
  name: string;
  unit: string;
  costUnitPriceCents: number;
  suggestedSaleUnitPriceCents: number;
  saleUnitPriceMinCents: number;
  saleUnitPriceMaxCents: number;
  applicableProjectTypes: ResearchProjectTypeId[];
  sensitive: boolean;
}

export interface LaborRoleRate {
  id: "director" | "senior_manager" | "manager" | "assistant";
  name: string;
  costPerDayCents: number;
  suggestedSalePerDayCents: number;
  salePerDayMinCents: number;
  salePerDayMaxCents: number;
}

export interface PriceBookConfig {
  version: number;
  updatedAt: string;
  items: PriceBookItem[];
  laborRoles: LaborRoleRate[];
}

export interface QuoteLine {
  id: string;
  name: string;
  detail: string;
  quantity: number;
  unit: string;
  costUnitPriceCents: number;
  saleUnitPriceCents: number;
  saleUnitPriceMinCents?: number;
  saleUnitPriceMaxCents?: number;
  costAmountCents: number;
  saleAmountCents: number;
  customerVisible: boolean;
}

export interface QuoteProject {
  id: string;
  industryPackId: string;
  projectTypeId: ResearchProjectTypeId;
  name: string;
  status: "draft" | "completed";
  parameters: Record<string, string | number | boolean>;
  taxRateBasisPoints: number;
  targetMarginBasisPoints: number;
  minimumMarginBasisPoints: number;
  lines: QuoteLine[];
  industryPackVersion: number;
  priceBookVersion: number;
  priceBookSnapshot: PriceBookConfig;
  createdAt: string;
  updatedAt: string;
}

export interface QuoteTotals {
  costCents: number;
  preTaxCents: number;
  taxCents: number;
  totalCents: number;
  marginCents: number;
  marginBasisPoints: number;
  minimumSafePriceCents: number;
}
