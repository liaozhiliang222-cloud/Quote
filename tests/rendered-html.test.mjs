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
  const [page, layout, pricing, database, manifest, serviceWorker] = await Promise.all([
    readFile(new URL("../app/page.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/layout.tsx", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/pricing.ts", import.meta.url), "utf8"),
    readFile(new URL("../app/lib/db.ts", import.meta.url), "utf8"),
    readFile(new URL("../public/manifest.webmanifest", import.meta.url), "utf8"),
    readFile(new URL("../public/sw.js", import.meta.url), "utf8"),
  ]);
  assert.match(layout, /manifest\.webmanifest/);
  assert.match(page, /serviceWorker\.register/);
  assert.match(database, /indexedDB\.open/);
  assert.doesNotMatch(database, /localStorage|sessionStorage/);
  assert.match(pricing, /minimumSafePriceCents/);
  assert.doesNotMatch(pricing, /eval\s*\(/);
  assert.equal(JSON.parse(manifest).display, "standalone");
  assert.match(serviceWorker, /caches\.open/);
});
