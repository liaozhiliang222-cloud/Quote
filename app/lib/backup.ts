import type { PriceBookConfig, QuoteProject } from "./models";

const BACKUP_KIND = "yanjia-local-backup";
const BACKUP_VERSION = 1;

interface LocalBackup {
  kind: typeof BACKUP_KIND;
  version: typeof BACKUP_VERSION;
  exportedAt: string;
  projects: QuoteProject[];
  priceBook: PriceBookConfig;
}

export function downloadLocalBackup(projects: QuoteProject[], priceBook: PriceBookConfig): void {
  const backup: LocalBackup = {
    kind: BACKUP_KIND,
    version: BACKUP_VERSION,
    exportedAt: new Date().toISOString(),
    projects,
    priceBook,
  };
  const blob = new Blob([JSON.stringify(backup, null, 2)], { type: "application/json;charset=utf-8" });
  const href = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = href;
  link.download = `研价本地备份-${new Date().toISOString().slice(0, 10)}.json`;
  link.click();
  URL.revokeObjectURL(href);
}

export async function readLocalBackup(file: File): Promise<{ projects: QuoteProject[]; priceBook: PriceBookConfig }> {
  const parsed = JSON.parse(await file.text()) as Partial<LocalBackup>;
  if (parsed.kind !== BACKUP_KIND || parsed.version !== BACKUP_VERSION || !Array.isArray(parsed.projects) || !parsed.priceBook) {
    throw new Error("不是有效的研价本地备份文件");
  }
  return { projects: parsed.projects, priceBook: parsed.priceBook };
}
