"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteAllProjects, getPriceBook, getProjects, savePriceBook, saveProject } from "./lib/db";
import { defaultPriceBook, researchIndustryPack } from "./lib/industry-pack";
import type { ManualCostItem, ParameterDefinition, PriceBookConfig, QuoteProject, ResearchProjectTypeId } from "./lib/models";
import { calculateLines, calculateTotals, formatMoney, getRisks } from "./lib/pricing";

type View = "dashboard" | "projects" | "quote" | "profit" | "pricebook" | "privacy";

const reportWorkload = (depth: string): Record<string, number> => {
  if (depth === "basic") return { laborDays_director: 0.5, laborDays_senior_manager: 1, laborDays_manager: 2, laborDays_assistant: 3 };
  if (depth === "deep") return { laborDays_director: 2, laborDays_senior_manager: 4, laborDays_manager: 7, laborDays_assistant: 10 };
  if (depth === "none") return { laborDays_director: 0, laborDays_senior_manager: 0, laborDays_manager: 0, laborDays_assistant: 0 };
  return { laborDays_director: 1, laborDays_senior_manager: 2, laborDays_manager: 4, laborDays_assistant: 6 };
};

const defaults: Record<ResearchProjectTypeId, QuoteProject["parameters"]> = {
  quantitative_online: { sampleSize: 1000, incidenceRate: 50, questionnaireMinutes: 12, targetAudience: "过去 3 个月购买过品类产品的消费者", cityCount: 3, reportDepth: "standard", ...reportWorkload("standard") },
  in_depth_interview: { interviewCount: 12, sessionDurationMinutes: 60, recruitmentDifficulty: "specific", transcriptRequired: true, targetAudience: "核心用户与流失用户", cityCount: 2, reportDepth: "standard", ...reportWorkload("standard") },
  focus_group: { sessionCount: 4, participantsPerSession: 8, backupParticipantsPerSession: 2, sessionDurationMinutes: 120, recruitmentDifficulty: "specific", deliveryMode: "offline", transcriptRequired: true, targetAudience: "目标品牌消费者", cityCount: 2, reportDepth: "deep", ...reportWorkload("deep") },
  mixed_research: { sampleSize: 800, qualitativeMethods: ["in_depth_interview", "focus_group"], interviewCount: 10, sessionDurationMinutes: 60, sessionCount: 4, participantsPerSession: 8, backupParticipantsPerSession: 2, deliveryMode: "offline", expertCount: 6, expertScarcity: "scarce", recruitmentDifficulty: "specific", transcriptRequired: true, targetAudience: "目标品类消费者", cityCount: 3, reportDepth: "deep", ...reportWorkload("deep") },
};

function normalizePriceBook(stored: PriceBookConfig): PriceBookConfig {
  return {
    ...stored,
    items: defaultPriceBook.items.map((fallback) => stored.items.find((item) => item.id === fallback.id) ?? fallback),
    laborRoles: defaultPriceBook.laborRoles.map((fallback) => stored.laborRoles.find((role) => role.id === fallback.id) ?? fallback),
  };
}

function createProject(type: ResearchProjectTypeId, priceBook: PriceBookConfig): QuoteProject {
  const now = new Date().toISOString();
  const typeName = researchIndustryPack.projectTypes.find((item) => item.id === type)?.name ?? "调研项目";
  const project: QuoteProject = {
    id: crypto.randomUUID(),
    industryPackId: researchIndustryPack.id,
    projectTypeId: type,
    name: `${typeName} · ${new Date().toLocaleDateString("zh-CN")}`,
    status: "draft",
    parameters: { ...defaults[type] },
    taxRateBasisPoints: 600,
    targetMarginBasisPoints: 3500,
    minimumMarginBasisPoints: 2500,
    lines: [],
    industryPackVersion: researchIndustryPack.version,
    priceBookVersion: priceBook.version,
    priceBookSnapshot: structuredClone(priceBook),
    costOverrides: {},
    manualCosts: [],
    profitAssumptions: { discountBasisPoints: 1000, costOverrunBasisPoints: 1500, riskReserveBasisPoints: 500 },
    createdAt: now,
    updatedAt: now,
  };
  project.lines = calculateLines(type, project.parameters, priceBook, project.costOverrides, project.manualCosts);
  return project;
}

function downloadCsv(project: QuoteProject) {
  const totals = calculateTotals(project);
  const rows = [
    ["客户报价", project.name],
    ["服务项目", "计价说明", "数量", "单位", "对外金额"],
    ...project.lines.filter((item) => item.customerVisible).map((item) => [item.name, item.detail, item.quantity, item.unit, (item.saleAmountCents / 100).toFixed(2)]),
    ["未税合计", "", "", "", (totals.preTaxCents / 100).toFixed(2)],
    ["税费", "", "", "", (totals.taxCents / 100).toFixed(2)],
    ["含税总价", "", "", "", (totals.totalCents / 100).toFixed(2)],
  ];
  const csv = "\uFEFF" + rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(",")).join("\r\n");
  const link = document.createElement("a");
  link.href = URL.createObjectURL(new Blob([csv], { type: "text/csv;charset=utf-8" }));
  link.download = `${project.name}.csv`;
  link.click();
  URL.revokeObjectURL(link.href);
}

function isParameterVisible(definition: ParameterDefinition, parameters: QuoteProject["parameters"]): boolean {
  if (!definition.visibleWhen) return true;
  const current = parameters[definition.visibleWhen.field];
  if (definition.visibleWhen.includes) return Array.isArray(current) && current.includes(definition.visibleWhen.includes);
  if (definition.visibleWhen.equals !== undefined) return current === definition.visibleWhen.equals;
  return true;
}

function Field({ definition, value, onChange }: { definition: ParameterDefinition; value: unknown; onChange: (value: string | number | boolean | string[]) => void }) {
  if (definition.dataType === "boolean") {
    return (
      <label className="switch-field">
        <span><strong>{definition.label}</strong><small>{definition.description ?? "按实际服务范围选择"}</small></span>
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        <i aria-hidden="true" />
      </label>
    );
  }
  if (definition.dataType === "multiSelect") {
    const selected = Array.isArray(value) ? value.map(String) : [];
    return (
      <fieldset className="multi-field">
        <legend>{definition.label}{definition.required && <em>*</em>}</legend>
        {definition.description && <small>{definition.description}</small>}
        <div>{definition.options?.map((option) => {
          const checked = selected.includes(option.value);
          return <label className={checked ? "selected" : ""} key={option.value}><input type="checkbox" checked={checked} onChange={() => onChange(checked ? selected.filter((item) => item !== option.value) : [...selected, option.value])} /><i>{checked ? "✓" : ""}</i><span>{option.label}</span></label>;
        })}</div>
      </fieldset>
    );
  }
  return (
    <label className="field">
      <span>{definition.label}{definition.required && <em>*</em>}</span>
      {definition.description && <small>{definition.description}</small>}
      <div className="input-wrap">
        {definition.dataType === "singleSelect" ? (
          <select value={String(value ?? "")} onChange={(event) => onChange(event.target.value)}>
            <option value="">请选择</option>
            {definition.options?.map((option) => <option value={option.value} key={option.value}>{option.label}</option>)}
          </select>
        ) : (
          <input
            type={definition.dataType === "text" ? "text" : "number"}
            min={0}
            value={String(value ?? "")}
            onChange={(event) => onChange(definition.dataType === "text" ? event.target.value : Number(event.target.value))}
          />
        )}
        {definition.unit && <b>{definition.unit}</b>}
      </div>
    </label>
  );
}

export default function Home() {
  const [view, setView] = useState<View>("dashboard");
  const [projects, setProjects] = useState<QuoteProject[]>([]);
  const [activeProject, setActiveProject] = useState<QuoteProject | null>(null);
  const [priceBook, setPriceBook] = useState<PriceBookConfig>(() => structuredClone(defaultPriceBook));
  const [priceSavedState, setPriceSavedState] = useState("价格配置保存在此设备");
  const [savedState, setSavedState] = useState("已保存在此设备");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);
  const [newCostDraft, setNewCostDraft] = useState<Omit<ManualCostItem, "id">>({ name: "", quantity: 1, unit: "项", costUnitPriceCents: 0, pricingMode: "internal_only", saleUnitPriceCents: 0, markupBasisPoints: 2000, note: "" });

  useEffect(() => {
    getProjects().then(setProjects).catch(() => setSavedState("本地存储暂不可用"));
    getPriceBook().then((stored) => { if (stored) setPriceBook(normalizePriceBook(stored)); }).catch(() => setPriceSavedState("价格库读取失败"));
    if ("serviceWorker" in navigator) navigator.serviceWorker.register("/sw.js");
    const handler = (event: Event) => { event.preventDefault(); setInstallPrompt(event); };
    window.addEventListener("beforeinstallprompt", handler);
    return () => window.removeEventListener("beforeinstallprompt", handler);
  }, []);

  useEffect(() => {
    if (!activeProject) return;
    setSavedState("正在保存…");
    const timer = window.setTimeout(async () => {
      await saveProject(activeProject);
      setProjects((current) => [activeProject, ...current.filter((item) => item.id !== activeProject.id)]);
      setSavedState("已保存在此设备");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [activeProject]);

  useEffect(() => {
    if (priceBook.updatedAt === defaultPriceBook.updatedAt) return;
    setPriceSavedState("正在保存价格配置…");
    const timer = window.setTimeout(async () => {
      await savePriceBook(priceBook);
      setPriceSavedState("价格配置已保存在此设备");
    }, 500);
    return () => window.clearTimeout(timer);
  }, [priceBook]);

  const typeDefinition = useMemo(() => researchIndustryPack.projectTypes.find((item) => item.id === activeProject?.projectTypeId), [activeProject?.projectTypeId]);
  const totals = activeProject ? calculateTotals(activeProject) : null;
  const risks = activeProject ? getRisks(activeProject) : [];
  const profitAssumptions = activeProject?.profitAssumptions ?? { discountBasisPoints: 1000, costOverrunBasisPoints: 1500, riskReserveBasisPoints: 500 };
  const reserveCents = totals ? Math.round(totals.costCents * profitAssumptions.riskReserveBasisPoints / 10000) : 0;
  const profitScenarios = totals ? [
    { id: "current", name: "当前方案", note: "按当前报价与预计成本", revenue: totals.preTaxCents, cost: totals.costCents + reserveCents },
    { id: "discount", name: "客户折扣方案", note: `报价下调 ${profitAssumptions.discountBasisPoints / 100}%`, revenue: Math.round(totals.preTaxCents * (10000 - profitAssumptions.discountBasisPoints) / 10000), cost: totals.costCents + reserveCents },
    { id: "overrun", name: "成本超支方案", note: `成本上浮 ${profitAssumptions.costOverrunBasisPoints / 100}%`, revenue: totals.preTaxCents, cost: Math.round(totals.costCents * (10000 + profitAssumptions.costOverrunBasisPoints) / 10000) + reserveCents },
  ].map((scenario) => ({ ...scenario, profit: scenario.revenue - scenario.cost, margin: scenario.revenue ? Math.round((scenario.revenue - scenario.cost) * 10000 / scenario.revenue) : 0 })) : [];

  const startQuote = (type: ResearchProjectTypeId) => {
    setActiveProject(createProject(type, priceBook));
    setView("quote");
  };

  const openProject = (project: QuoteProject) => {
    const snapshot = normalizePriceBook(project.priceBookSnapshot ?? structuredClone(defaultPriceBook));
    const costOverrides = project.costOverrides ?? {};
    const manualCosts = project.manualCosts ?? [];
    setActiveProject({ ...project, priceBookSnapshot: snapshot, priceBookVersion: project.priceBookVersion ?? snapshot.version, costOverrides, manualCosts, profitAssumptions: project.profitAssumptions ?? { discountBasisPoints: 1000, costOverrunBasisPoints: 1500, riskReserveBasisPoints: 500 }, lines: calculateLines(project.projectTypeId, project.parameters, snapshot, costOverrides, manualCosts) });
    setView("quote");
  };

  const updateProject = (patch: Partial<QuoteProject>) => {
    setActiveProject((current) => {
      if (!current) return current;
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      next.costOverrides ??= {};
      next.manualCosts ??= [];
      next.profitAssumptions ??= { discountBasisPoints: 1000, costOverrunBasisPoints: 1500, riskReserveBasisPoints: 500 };
      next.lines = calculateLines(next.projectTypeId, next.parameters, next.priceBookSnapshot ?? priceBook, next.costOverrides, next.manualCosts);
      return next;
    });
  };

  const updateCostOverride = (lineId: string, costUnitPriceCents: number, reason?: string) => {
    if (!activeProject) return;
    updateProject({ costOverrides: { ...activeProject.costOverrides, [lineId]: { costUnitPriceCents, reason: reason ?? activeProject.costOverrides[lineId]?.reason ?? "" } } });
  };

  const addManualCost = () => {
    if (!activeProject || !newCostDraft.name.trim() || newCostDraft.costUnitPriceCents < 0) return;
    updateProject({ manualCosts: [...activeProject.manualCosts, { ...newCostDraft, id: `manual_${crypto.randomUUID()}` }] });
    setNewCostDraft({ name: "", quantity: 1, unit: "项", costUnitPriceCents: 0, pricingMode: "internal_only", saleUnitPriceCents: 0, markupBasisPoints: 2000, note: "" });
  };

  const updatePriceBook = (next: PriceBookConfig) => {
    setPriceBook({ ...next, version: Math.max(1, next.version), updatedAt: new Date().toISOString() });
  };

  return (
    <main className="app-shell">
      <aside className="sidebar">
        <div className="brand"><div className="brand-mark">研</div><div><strong>研价</strong><span>调研报价助手</span></div></div>
        <nav>
          <button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}><span>⌂</span> 工作台</button>
          <button className={view === "projects" ? "active" : ""} onClick={() => setView("projects")}><span>▤</span> 报价项目 <b>{projects.length}</b></button>
          <button onClick={() => { setActiveProject(null); setView("quote"); }} className={view === "quote" ? "active" : ""}><span>＋</span> 新建报价</button>
          <div className="nav-label">数据管理</div>
          <button onClick={() => setView("pricebook")} className={view === "pricebook" ? "active" : ""}><span>￥</span> 成本与价格库</button>
          <button onClick={() => setView("privacy")} className={view === "privacy" ? "active" : ""}><span>◇</span> 数据与隐私</button>
        </nav>
        <div className="privacy-card"><div><i>✓</i><strong>本地保护已开启</strong></div><p>项目与价格数据仅保存在此设备，不会自动上传。</p><button onClick={() => setView("privacy")}>查看数据状态 →</button></div>
        <div className="sidebar-foot"><span>行业包 v{researchIndustryPack.version}.0</span><i /> <span>价格库 v{priceBook.version}.0</span></div>
      </aside>

      <section className="workspace">
        <header className="topbar">
          <div className="mobile-brand"><div className="brand-mark">研</div><strong>研价</strong></div>
          <div className="local-status"><span /> 所有数据仅保存在此设备</div>
          <div className="top-actions">
            {installPrompt && <button className="install" onClick={async () => { await (installPrompt as Event & { prompt: () => Promise<void> }).prompt(); setInstallPrompt(null); }}>安装应用</button>}
            <button className="icon-button" aria-label="帮助">?</button>
            <div className="avatar">R</div>
          </div>
        </header>

        {view === "dashboard" && (
          <div className="page dashboard">
            <div className="hero-row">
              <div><span className="eyebrow">RESEARCH QUOTE WORKSPACE</span><h1>早上好，开始今天的报价吧</h1><p>从调研类型开始，系统会按行业规则补齐费用与风险。</p></div>
              <button className="primary" onClick={() => setView("quote")}>＋ 新建报价</button>
            </div>
            <section className="type-section">
              <div className="section-heading"><div><h2>按项目类型快速开始</h2><p>已配置常用参数、服务模块和报价规则</p></div><span>{researchIndustryPack.projectTypes.length} 个研究模板</span></div>
              <div className="type-grid">
                {researchIndustryPack.projectTypes.map((type, index) => (
                  <button className="type-card" onClick={() => startQuote(type.id)} key={type.id} style={{ "--accent": type.accent } as React.CSSProperties}>
                    <div className="type-icon">{["▦", "◉", "◌", "◫"][index]}</div>
                    <div><h3>{type.name}</h3><p>{type.shortDescription}</p><span>开始测算 <b>→</b></span></div>
                  </button>
                ))}
              </div>
            </section>
            <div className="dashboard-grid">
              <section className="panel recent-panel">
                <div className="section-heading"><div><h2>最近报价</h2><p>继续编辑设备上保存的项目</p></div><button className="text-button" onClick={() => setView("projects")}>查看全部</button></div>
                {projects.length === 0 ? <div className="empty"><span>▤</span><strong>还没有报价项目</strong><p>创建第一份报价后，会自动出现在这里。</p></div> : projects.slice(0, 4).map((project) => {
                  const amount = calculateTotals(project).totalCents;
                  const type = researchIndustryPack.projectTypes.find((item) => item.id === project.projectTypeId);
                  return <button className="project-row" key={project.id} onClick={() => openProject(project)}><i style={{ background: type?.accent }} /><div><strong>{project.name}</strong><span>{type?.name} · {new Date(project.updatedAt).toLocaleDateString("zh-CN")}</span></div><b>{formatMoney(amount)}</b><em>继续 →</em></button>;
                })}
              </section>
              <aside className="panel guard-panel"><div className="guard-head"><span>✓</span><div><h2>隐私护盾</h2><p>本地优先模式</p></div></div><div className="shield-score"><strong>100</strong><span>/ 100</span></div><ul><li><i>✓</i> 项目数据未上传</li><li><i>✓</i> 价格库仅本地可见</li><li><i>✓</i> 离线计算已启用</li></ul><button onClick={() => setView("privacy")}>管理本地数据</button></aside>
            </div>
          </div>
        )}

        {view === "projects" && (
          <div className="page"><div className="hero-row compact"><div><span className="eyebrow">LOCAL PROJECTS</span><h1>报价项目</h1><p>所有项目都保存在当前设备。</p></div><button className="primary" onClick={() => setView("quote")}>＋ 新建报价</button></div>
            <section className="panel project-list">{projects.length === 0 ? <div className="empty tall"><span>▤</span><strong>暂无本地项目</strong><p>新建一份报价，系统会为你自动保存。</p></div> : projects.map((project) => <button className="project-row" key={project.id} onClick={() => openProject(project)}><i style={{ background: researchIndustryPack.projectTypes.find((item) => item.id === project.projectTypeId)?.accent }} /><div><strong>{project.name}</strong><span>{project.status === "draft" ? "草稿" : "已完成"} · 更新于 {new Date(project.updatedAt).toLocaleString("zh-CN")}</span></div><b>{formatMoney(calculateTotals(project).totalCents)}</b><em>打开 →</em></button>)}</section>
          </div>
        )}

        {view === "quote" && !activeProject && (
          <div className="page"><div className="hero-row compact"><div><span className="eyebrow">NEW QUOTE</span><h1>选择项目类型</h1><p>只展示当前项目适用的调研参数。</p></div></div><div className="select-type-grid">{researchIndustryPack.projectTypes.map((type) => <button key={type.id} onClick={() => startQuote(type.id)} style={{ "--accent": type.accent } as React.CSSProperties}><span>01</span><h2>{type.name}</h2><p>{type.shortDescription}</p><b>使用此模板 →</b></button>)}</div></div>
        )}

        {view === "quote" && activeProject && totals && typeDefinition && (
          <div className="quote-page">
            <div className="quote-head"><button className="back" onClick={() => setView("dashboard")}>←</button><div><span>{typeDefinition.name}</span><input aria-label="项目名称" value={activeProject.name} onChange={(event) => updateProject({ name: event.target.value })} /><small><i /> {savedState}</small></div><div className="quote-actions"><button className="profit-button" onClick={() => setView("profit")}>利润测算</button><button onClick={() => downloadCsv(activeProject)}>导出 Excel</button><button onClick={() => window.print()}>打印 / PDF</button></div></div>
            <div className="steps"><span className="done">✓<b>项目类型</b></span><i /><span className="current">2<b>需求与报价</b></span><i /><span>3<b>风险检查</b></span><i /><span>4<b>导出</b></span></div>
            <div className="quote-layout">
              <section className="form-panel panel"><div className="panel-title"><div><span>02</span><div><h2>需求参数</h2><p>字段来自 {researchIndustryPack.name}，不同类型互不干扰</p></div></div><b>{typeDefinition.parameters.filter((field) => isParameterVisible(field, activeProject.parameters) && field.required && activeProject.parameters[field.id] !== "" && (!Array.isArray(activeProject.parameters[field.id]) || (activeProject.parameters[field.id] as string[]).length > 0)).length}/{typeDefinition.parameters.filter((field) => isParameterVisible(field, activeProject.parameters) && field.required).length} 必填项</b></div>
                <div className="form-grid">{typeDefinition.parameters.filter((definition) => isParameterVisible(definition, activeProject.parameters)).map((definition) => <Field key={definition.id} definition={definition} value={activeProject.parameters[definition.id]} onChange={(value) => updateProject({ parameters: { ...activeProject.parameters, [definition.id]: value, ...(definition.id === "reportDepth" ? reportWorkload(String(value)) : {}) } })} />)}</div>
                {activeProject.parameters.reportDepth !== "none" && (
                  <div className="labor-section">
                    <div className="labor-title"><div><h3>报告投入人天</h3><p>按实际项目团队配置，各职级人天将分别计入成本与报价</p></div><button onClick={() => setView("pricebook")}>配置人天单价 →</button></div>
                    <div className="labor-grid">{activeProject.priceBookSnapshot.laborRoles.map((role) => (
                      <label key={role.id}><span>{role.name}</span><small>成本 {formatMoney(role.costPerDayCents)} · 建议 {formatMoney(role.salePerDayMinCents)}–{formatMoney(role.salePerDayMaxCents)}/天</small><div><input type="number" min="0" step="0.5" value={Number(activeProject.parameters[`laborDays_${role.id}`] ?? 0)} onChange={(event) => updateProject({ parameters: { ...activeProject.parameters, [`laborDays_${role.id}`]: Number(event.target.value) } })} /><b>人天</b></div></label>
                    ))}</div>
                  </div>
                )}
                <div className="cost-section">
                  <div className="labor-title"><div><h3>项目成本调整</h3><p>调整只影响当前项目，并保留价格库原始单价作为计算依据</p></div><span>{Object.keys(activeProject.costOverrides).length} 项已调整</span></div>
                  <div className="override-list">{activeProject.lines.filter((line) => line.source !== "manual").map((line) => <div className="override-row" key={line.id}><div><strong>{line.name}</strong><small>价格库成本 {formatMoney(activeProject.priceBookSnapshot.items.find((item) => line.id.startsWith(item.id))?.costUnitPriceCents ?? line.costUnitPriceCents)}/{line.unit}</small></div><label><span>实际单位成本</span><div><i>¥</i><input type="number" min="0" value={line.costUnitPriceCents / 100} onChange={(event) => updateCostOverride(line.id, Math.round(Number(event.target.value) * 100))} /></div></label><label className="reason-input"><span>调整说明</span><input placeholder="如：供应商实际报价" value={activeProject.costOverrides[line.id]?.reason ?? ""} onChange={(event) => updateCostOverride(line.id, line.costUnitPriceCents, event.target.value)} /></label></div>)}</div>
                  <div className="manual-costs"><div className="manual-heading"><div><strong>自定义成本</strong><span>差旅、翻译、供应商、设备、加急等项目专属费用</span></div></div>{activeProject.manualCosts.map((item) => <div className="manual-item" key={item.id}><div><strong>{item.name}</strong><span>{item.quantity} {item.unit} · 成本 {formatMoney(item.quantity * item.costUnitPriceCents)} · {item.pricingMode === "internal_only" ? "内部承担" : item.pricingMode === "pass_through" ? "原价转嫁" : item.pricingMode === "markup" ? `加价 ${item.markupBasisPoints / 100}%` : "指定售价"}</span></div><button onClick={() => updateProject({ manualCosts: activeProject.manualCosts.filter((current) => current.id !== item.id) })}>删除</button></div>)}
                    <div className="manual-form"><label><span>成本名称</span><input placeholder="例如：异地差旅" value={newCostDraft.name} onChange={(event) => setNewCostDraft({ ...newCostDraft, name: event.target.value })} /></label><label><span>数量</span><input type="number" min="0" step="0.5" value={newCostDraft.quantity} onChange={(event) => setNewCostDraft({ ...newCostDraft, quantity: Number(event.target.value) })} /></label><label><span>单位</span><input value={newCostDraft.unit} onChange={(event) => setNewCostDraft({ ...newCostDraft, unit: event.target.value })} /></label><label><span>单位成本</span><div><i>¥</i><input type="number" min="0" value={newCostDraft.costUnitPriceCents / 100} onChange={(event) => setNewCostDraft({ ...newCostDraft, costUnitPriceCents: Math.round(Number(event.target.value) * 100) })} /></div></label><label><span>报价方式</span><select value={newCostDraft.pricingMode} onChange={(event) => setNewCostDraft({ ...newCostDraft, pricingMode: event.target.value as ManualCostItem["pricingMode"] })}><option value="internal_only">仅计入内部成本</option><option value="pass_through">成本原价转嫁</option><option value="fixed">指定对外单价</option><option value="markup">按成本加价</option></select></label>{newCostDraft.pricingMode === "fixed" && <label><span>对外单价</span><div><i>¥</i><input type="number" min="0" value={newCostDraft.saleUnitPriceCents / 100} onChange={(event) => setNewCostDraft({ ...newCostDraft, saleUnitPriceCents: Math.round(Number(event.target.value) * 100) })} /></div></label>}{newCostDraft.pricingMode === "markup" && <label><span>加价率</span><div><input type="number" min="0" value={newCostDraft.markupBasisPoints / 100} onChange={(event) => setNewCostDraft({ ...newCostDraft, markupBasisPoints: Math.round(Number(event.target.value) * 100) })} /><i>%</i></div></label>}<label className="manual-note"><span>备注</span><input placeholder="内部说明，可选" value={newCostDraft.note} onChange={(event) => setNewCostDraft({ ...newCostDraft, note: event.target.value })} /></label><button onClick={addManualCost}>＋ 添加成本</button></div>
                  </div>
                </div>
                <div className="commercial"><h3>商业规则</h3><div><label>税率 <span><input type="number" value={activeProject.taxRateBasisPoints / 100} onChange={(event) => updateProject({ taxRateBasisPoints: Number(event.target.value) * 100 })} />%</span></label><label>目标毛利率 <span><input type="number" value={activeProject.targetMarginBasisPoints / 100} onChange={(event) => updateProject({ targetMarginBasisPoints: Number(event.target.value) * 100 })} />%</span></label><label>最低毛利率 <span><input type="number" value={activeProject.minimumMarginBasisPoints / 100} onChange={(event) => updateProject({ minimumMarginBasisPoints: Number(event.target.value) * 100 })} />%</span></label></div></div>
              </section>
              <aside className="summary-column">
                <section className="panel total-card"><div className="total-label"><span>含税报价</span><b>实时测算</b></div><strong>{formatMoney(totals.totalCents)}</strong><div className="metrics"><div><span>执行成本</span><b>{formatMoney(totals.costCents)}</b></div><div><span>毛利率</span><b className={totals.marginBasisPoints < activeProject.minimumMarginBasisPoints ? "danger" : "good"}>{(totals.marginBasisPoints / 100).toFixed(1)}%</b></div><div><span>最低安全价</span><b>{formatMoney(totals.minimumSafePriceCents)}</b></div></div></section>
                <section className="panel detail-card"><div className="section-heading"><div><h2>报价明细</h2><p>{activeProject.lines.length} 项规则计算</p></div><span>可解释</span></div>{activeProject.lines.map((item) => <div className="line-item" key={item.id}><div><strong>{item.name}</strong><span>{item.detail}</span>{item.saleUnitPriceMinCents !== undefined && <em>单价区间 {formatMoney(item.saleUnitPriceMinCents)}–{formatMoney(item.saleUnitPriceMaxCents ?? item.saleUnitPriceMinCents)}/{item.unit}</em>}</div><b>{formatMoney(item.saleAmountCents)}</b></div>)}<div className="subtotal"><span>未税报价</span><b>{formatMoney(totals.preTaxCents)}</b></div></section>
                <section className={`panel risk-card ${risks.length ? "has-risk" : ""}`}><div><span>{risks.length ? "!" : "✓"}</span><strong>{risks.length ? `${risks.length} 项待确认` : "未发现明显漏项"}</strong></div>{risks.map((risk) => <p key={risk}>• {risk}</p>)}</section>
              </aside>
            </div>
          </div>
        )}

        {view === "profit" && activeProject && totals && (
          <div className="page profit-page">
            <div className="profit-head"><button className="back" onClick={() => setView("quote")}>←</button><div><span className="eyebrow">INTERNAL PROFIT ESTIMATE</span><h1>利润测算</h1><p>{activeProject.name} · 仅内部可见，不进入客户报价单或导出文件</p></div><span className="internal-badge">内部数据</span></div>
            <section className="panel assumption-panel"><div><h2>情景参数</h2><p>调整参数即可实时查看利润敏感度，计算基于未税收入。</p></div><div className="assumption-grid"><label><span>客户折扣</span><div><input type="number" min="0" max="100" value={profitAssumptions.discountBasisPoints / 100} onChange={(event) => updateProject({ profitAssumptions: { ...profitAssumptions, discountBasisPoints: Math.round(Number(event.target.value) * 100) } })} /><b>%</b></div></label><label><span>成本超支</span><div><input type="number" min="0" value={profitAssumptions.costOverrunBasisPoints / 100} onChange={(event) => updateProject({ profitAssumptions: { ...profitAssumptions, costOverrunBasisPoints: Math.round(Number(event.target.value) * 100) } })} /><b>%</b></div></label><label><span>风险预留</span><div><input type="number" min="0" value={profitAssumptions.riskReserveBasisPoints / 100} onChange={(event) => updateProject({ profitAssumptions: { ...profitAssumptions, riskReserveBasisPoints: Math.round(Number(event.target.value) * 100) } })} /><b>%</b></div></label></div></section>
            <div className="scenario-grid">{profitScenarios.map((scenario, index) => <section className={`scenario-card panel scenario-${index}`} key={scenario.id}><div className="scenario-title"><div><span>0{index + 1}</span><strong>{scenario.name}</strong></div><em>{scenario.note}</em></div><div className="scenario-profit"><span>预计毛利润</span><strong className={scenario.profit < 0 ? "danger" : ""}>{formatMoney(scenario.profit)}</strong><b className={scenario.margin < activeProject.minimumMarginBasisPoints ? "danger" : "good"}>{(scenario.margin / 100).toFixed(1)}%</b></div><div className="scenario-metrics"><div><span>未税收入</span><b>{formatMoney(scenario.revenue)}</b></div><div><span>预计总成本</span><b>{formatMoney(scenario.cost)}</b></div><div><span>安全毛利线</span><b>{(activeProject.minimumMarginBasisPoints / 100).toFixed(0)}%</b></div></div></section>)}</div>
            <div className="profit-detail-grid"><section className="panel profit-breakdown"><div className="price-panel-head"><div><h2>成本构成</h2><p>系统规则、人员工时与手动成本分开核算</p></div><span>风险预留 {formatMoney(reserveCents)}</span></div>{[
              { name: "直接执行与服务成本", value: activeProject.lines.filter((line) => line.source !== "manual" && !line.id.startsWith("labor_")).reduce((sum, line) => sum + line.costAmountCents, 0), color: "#4969f5" },
              { name: "内部人员工时成本", value: activeProject.lines.filter((line) => line.id.startsWith("labor_")).reduce((sum, line) => sum + line.costAmountCents, 0), color: "#7d58d6" },
              { name: "手动追加成本", value: activeProject.lines.filter((line) => line.source === "manual").reduce((sum, line) => sum + line.costAmountCents, 0), color: "#f08a41" },
              { name: "风险预留", value: reserveCents, color: "#00a785" },
            ].map((item) => <div className="breakdown-row" key={item.name}><i style={{ background: item.color }} /><span>{item.name}</span><div><b style={{ width: `${Math.max(2, (item.value / Math.max(1, totals.costCents + reserveCents)) * 100)}%`, background: item.color }} /></div><strong>{formatMoney(item.value)}</strong></div>)}</section><section className="panel profit-summary"><span>当前项目利润结论</span><strong>{profitScenarios[0]?.margin >= activeProject.targetMarginBasisPoints ? "利润空间健康" : profitScenarios[0]?.margin >= activeProject.minimumMarginBasisPoints ? "利润空间可接受" : "利润低于安全线"}</strong><p>当前方案已计入 {formatMoney(reserveCents)} 风险预留。客户折扣与成本超支情景独立计算，便于判断谈判底线。</p><div><span>目标毛利率</span><b>{activeProject.targetMarginBasisPoints / 100}%</b></div><div><span>最低毛利率</span><b>{activeProject.minimumMarginBasisPoints / 100}%</b></div><button onClick={() => setView("quote")}>返回调整项目成本</button></section></div>
          </div>
        )}

        {view === "pricebook" && (
          <div className="page pricebook-page">
            <div className="hero-row compact"><div><span className="eyebrow">LOCAL PRICE BOOK</span><h1>成本与价格库</h1><p>统一维护单项成本、建议售价和价格区间；历史项目保留创建时的价格快照。</p></div><button className="primary" onClick={() => updatePriceBook({ ...priceBook, version: priceBook.version + 1 })}>发布为 v{priceBook.version + 1}.0</button></div>
            <div className="pricebook-notice"><span>✓</span><div><strong>{priceSavedState}</strong><p>修改会用于之后新建的报价，不会回写既有项目金额。</p></div><b>当前 v{priceBook.version}.0</b></div>
            <section className="panel price-panel"><div className="price-panel-head"><div><h2>服务项目单价</h2><p>每一项报价均由数量 × 当前单价计算，区间用于商务判断和异常提醒。</p></div><span>{priceBook.items.length} 个价格项</span></div><div className="price-table"><div className="price-row price-header"><span>价格项</span><span>单位</span><span>内部成本</span><span>建议下限</span><span>默认售价</span><span>建议上限</span></div>{priceBook.items.map((item) => <div className="price-row" key={item.id}><div><strong>{item.name}</strong><small>{item.sensitive ? "内部敏感价格" : "标准服务价格"}</small></div><span>{item.unit}</span>{(["costUnitPriceCents", "saleUnitPriceMinCents", "suggestedSaleUnitPriceCents", "saleUnitPriceMaxCents"] as const).map((key) => <label key={key}><i>¥</i><input aria-label={`${item.name}${key}`} type="number" min="0" step="10" value={item[key] / 100} onChange={(event) => updatePriceBook({ ...priceBook, items: priceBook.items.map((current) => current.id === item.id ? { ...current, [key]: Math.round(Number(event.target.value) * 100) } : current) })} /></label>)}</div>)}</div></section>
            <section className="panel price-panel"><div className="price-panel-head"><div><h2>研究人员人天成本</h2><p>报告报价按各职级实际投入人天分别计算，支持 0.5 人天精度。</p></div><span>{priceBook.laborRoles.length} 个职级</span></div><div className="price-table labor-price-table"><div className="price-row price-header"><span>研究职级</span><span>计价单位</span><span>内部成本</span><span>建议下限</span><span>默认售价</span><span>建议上限</span></div>{priceBook.laborRoles.map((role) => <div className="price-row" key={role.id}><div><strong>{role.name}</strong><small>报告分析与撰写</small></div><span>人天</span>{(["costPerDayCents", "salePerDayMinCents", "suggestedSalePerDayCents", "salePerDayMaxCents"] as const).map((key) => <label key={key}><i>¥</i><input aria-label={`${role.name}${key}`} type="number" min="0" step="100" value={role[key] / 100} onChange={(event) => updatePriceBook({ ...priceBook, laborRoles: priceBook.laborRoles.map((current) => current.id === role.id ? { ...current, [key]: Math.round(Number(event.target.value) * 100) } : current) })} /></label>)}</div>)}</div></section>
          </div>
        )}

        {view === "privacy" && (
          <div className="page"><div className="hero-row compact"><div><span className="eyebrow">PRIVACY CENTER</span><h1>数据与隐私</h1><p>透明掌控这台设备上的业务数据。</p></div></div><div className="privacy-grid"><section className="panel privacy-overview"><span className="big-shield">✓</span><div><h2>本地优先保护正常</h2><p>未主动调用 AI 或同步时，项目名称、报价、成本、毛利和明细不会离开此设备。</p></div></section><section className="panel data-card"><h2>设备数据</h2><div><span>本地项目</span><b>{projects.length} 个</b></div><div><span>数据传输记录</span><b className="good">0 条</b></div><div><span>AI 发送记录</span><b className="good">0 条</b></div><button onClick={async () => { if (window.confirm("确定删除此设备上的全部报价项目？此操作无法撤销。")) { await deleteAllProjects(); setProjects([]); } }}>删除全部本地项目</button></section><section className="panel data-card"><h2>离线能力</h2><div><span>报价计算</span><b className="good">可用</b></div><div><span>项目保存</span><b className="good">可用</b></div><div><span>导出 CSV / PDF</span><b className="good">可用</b></div><p>首次打开后，即使断网也可以继续完成核心报价流程。</p></section></div></div>
        )}
      </section>

      <nav className="mobile-nav"><button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>⌂<span>首页</span></button><button className={view === "quote" || view === "profit" ? "active" : ""} onClick={() => { if (!activeProject) setActiveProject(null); setView("quote"); }}>＋<span>报价</span></button><button className={view === "projects" ? "active" : ""} onClick={() => setView("projects")}>▤<span>项目</span></button><button className={view === "pricebook" ? "active" : ""} onClick={() => setView("pricebook")}>￥<span>价格</span></button><button className={view === "privacy" ? "active" : ""} onClick={() => setView("privacy")}>◇<span>我的</span></button></nav>
    </main>
  );
}
