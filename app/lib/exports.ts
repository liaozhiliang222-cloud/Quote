import type { Sheet, SheetData } from "write-excel-file/browser";
import type { ProjectTypeDefinition, QuoteProject } from "./models";
import { calculateTotals } from "./pricing";

export type ExportMode = "customer" | "internal";

const money = (cents: number) => Number((cents / 100).toFixed(2));
const safeFileName = (value: string) => value.replace(/[\\/:*?"<>|]/g, "-").slice(0, 80);
const header = (values: string[]): SheetData[number] => values.map((value) => ({ value, type: String, fontWeight: "bold", backgroundColor: "E9EDFF", align: "center" }));

function parameterValue(project: QuoteProject, definition: ProjectTypeDefinition["parameters"][number]): string | number {
  const value = project.parameters[definition.id];
  if (Array.isArray(value)) return value.map((item) => definition.options?.find((option) => option.value === item)?.label ?? item).join("、");
  if (typeof value === "boolean") return value ? "是" : "否";
  if (definition.options) return definition.options.find((option) => option.value === value)?.label ?? String(value ?? "");
  return value === undefined ? "" : value;
}

export async function exportQuoteWorkbook(project: QuoteProject, typeDefinition: ProjectTypeDefinition, mode: ExportMode): Promise<void> {
  const { default: writeXlsxFile } = await import("write-excel-file/browser");
  const totals = calculateTotals(project);
  const customerLines = project.lines.filter((line) => line.customerVisible);
  const customerData: SheetData = [
    [{ value: `${project.name}（客户报价）`, type: String, fontWeight: "bold", fontSize: 16, columnSpan: 5, align: "center" }],
    ["项目类型", typeDefinition.name, "报价版本", `V${project.quoteVersion ?? 1}`, ""],
    ["报价有效期", `${project.validityDays ?? 30} 天`, "报价日期", new Date().toLocaleDateString("zh-CN"), ""],
    [],
    header(["服务项目", "计价说明", "数量", "单位", "对外金额（元）"]),
    ...customerLines.map((line) => [line.name, line.detail, line.quantity, line.unit, money(line.saleAmountCents)]),
    ["未税合计", "", "", "", money(totals.preTaxCents)],
    ["税费", `${project.taxRateBasisPoints / 100}%`, "", "", money(totals.taxCents)],
    [{ value: "含税总价", type: String, fontWeight: "bold" }, "", "", "", { value: money(totals.totalCents), type: Number, fontWeight: "bold" }],
    [],
    ["商务条款", project.businessTerms || "本报价有效期内有效；超出约定服务范围的需求另行评估。", "", "", ""],
  ];
  const parameterData: SheetData = [
    header(["报价参数", "参数值", "单位"]),
    ...typeDefinition.parameters.map((definition) => [definition.label, parameterValue(project, definition), definition.unit ?? ""]),
  ];
  const sheets: Sheet<Blob>[] = [
    { sheet: "客户报价", data: customerData, columns: [{ width: 22 }, { width: 48 }, { width: 12 }, { width: 12 }, { width: 18 }], showGridLines: false },
    { sheet: "报价参数", data: parameterData, columns: [{ width: 28 }, { width: 48 }, { width: 12 }], showGridLines: false },
  ];
  if (mode === "internal") {
    const internalData: SheetData = [
      header(["费用项目", "数量", "单位", "单位成本（元）", "成本小计（元）", "对外金额（元）", "成本调整说明"]),
      ...project.lines.map((line) => [line.name, line.quantity, line.unit, money(line.costUnitPriceCents), money(line.costAmountCents), money(line.saleAmountCents), line.costOverrideReason ?? ""]),
      [],
      ["成本合计", "", "", "", money(totals.costCents), "", ""],
      ["毛利额", "", "", "", "", money(totals.marginCents), ""],
      ["毛利率", "", "", "", "", `${(totals.marginBasisPoints / 100).toFixed(1)}%`, ""],
      ["最低安全价（未税）", "", "", "", "", money(totals.minimumSafePriceCents), ""],
    ];
    const calculationData: SheetData = [
      header(["费用项目", "计算公式与依据", "建议单价下限（元）", "默认售价（元）", "建议单价上限（元）"]),
      ...project.lines.map((line) => [line.name, line.detail, line.saleUnitPriceMinCents === undefined ? "" : money(line.saleUnitPriceMinCents), money(line.saleUnitPriceCents), line.saleUnitPriceMaxCents === undefined ? "" : money(line.saleUnitPriceMaxCents)]),
    ];
    sheets.splice(1, 0,
      { sheet: "内部成本", data: internalData, columns: [{ width: 26 }, { width: 12 }, { width: 10 }, { width: 18 }, { width: 18 }, { width: 18 }, { width: 32 }], showGridLines: false },
      { sheet: "计算依据", data: calculationData, columns: [{ width: 26 }, { width: 58 }, { width: 20 }, { width: 18 }, { width: 20 }], showGridLines: false },
    );
  }
  const blob = await writeXlsxFile(sheets, { fontFamily: "Microsoft YaHei", fontSize: 10 }).toBlob();
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `${safeFileName(project.name)}-${mode === "customer" ? "客户报价" : "内部报价"}-V${project.quoteVersion ?? 1}.xlsx`;
  link.click();
  URL.revokeObjectURL(href);
}
