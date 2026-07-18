import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

async function render() {
  const workerUrl = new URL("../dist/server/index.js", import.meta.url);
  workerUrl.searchParams.set("test", `${process.pid}-${Date.now()}`);
  const { default: worker } = await import(workerUrl.href);
  return worker.fetch(
    new Request("http://localhost/", { headers: { accept: "text/html" } }),
    { ASSETS: { fetch: async () => new Response("Not found", { status: 404 }) } },
    { waitUntil() {}, passThroughOnException() {} },
  );
}

test("server-renders the research quote application shell", async () => {
  const response = await render();
  assert.equal(response.status, 200);
  assert.match(response.headers.get("content-type") ?? "", /^text\/html\b/i);
  const html = await response.text();
  assert.match(html, /研价/);
  assert.match(html, /调研报价助手/);
  assert.match(html, /本地保护已开启/);
  assert.doesNotMatch(html, /codex-preview|Your site is taking shape/);
});

test("keeps privacy, pricing, and PWA foundations in source", async () => {
  const [page, layout, pricing, database, industryPack, models, manifest, serviceWorker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/pricing.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/db.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/industry-pack.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/models.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(page, /serviceWorker\.register/);
  assert.match(database, /indexedDB\.open/);
  assert.doesNotMatch(database, /localStorage|sessionStorage/);
  assert.match(pricing, /minimumSafePriceCents/);
  assert.match(pricing, /laborDays_/);
  assert.match(pricing, /reportDepth !== "none"/);
  assert.doesNotMatch(pricing, /eval\s*\(/);
  assert.match(industryPack, /无需报告/);
  assert.match(industryPack, /覆盖省份/);
  assert.match(industryPack, /研究总监/);
  assert.match(industryPack, /定性研究方法/);
  assert.match(industryPack, /焦点小组\/座谈会/);
  assert.match(industryPack, /专家访谈/);
  assert.match(industryPack, /专家稀缺度/);
  assert.match(pricing, /includesDepthInterview/);
  assert.match(pricing, /includesFocusGroup/);
  assert.match(pricing, /includesExpertInterview/);
  assert.match(pricing, /manualCosts/);
  assert.match(pricing, /costOverrides/);
  assert.match(pricing, /item\.id\.startsWith\("labor_"\)/);
  assert.match(models, /priceBookSnapshot/);
  assert.match(models, /multiSelect/);
  assert.match(page, /成本与价格库/);
  assert.match(page, /项目成本调整/);
  assert.match(page, /人员工时成本按价格库固定单价计算/);
  assert.match(page, /利润测算/);
  assert.match(page, /客户折扣方案/);
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(serviceWorker, /caches\.open/);
});
