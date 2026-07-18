"use client";

import { useEffect, useMemo, useState } from "react";
import { deleteAllProjects, getProjects, saveProject } from "./lib/db";
import { researchIndustryPack } from "./lib/industry-pack";
import type { ParameterDefinition, QuoteProject, ResearchProjectTypeId } from "./lib/models";
import { calculateLines, calculateTotals, formatMoney, getRisks } from "./lib/pricing";

type View = "dashboard" | "projects" | "quote" | "privacy";

const defaults: Record<ResearchProjectTypeId, QuoteProject["parameters"]> = {
  quantitative_online: { sampleSize: 1000, incidenceRate: 50, questionnaireMinutes: 12, targetAudience: "过去 3 个月购买过品类产品的消费者", cityCount: 3, reportDepth: "standard" },
  in_depth_interview: { interviewCount: 12, sessionDurationMinutes: 60, recruitmentDifficulty: "specific", transcriptRequired: true, targetAudience: "核心用户与流失用户", cityCount: 2, reportDepth: "standard" },
  focus_group: { sessionCount: 4, participantsPerSession: 8, backupParticipantsPerSession: 2, sessionDurationMinutes: 120, recruitmentDifficulty: "specific", deliveryMode: "offline", transcriptRequired: true, targetAudience: "目标品牌消费者", cityCount: 2, reportDepth: "deep" },
  mixed_research: { sampleSize: 800, interviewCount: 10, targetAudience: "目标品类消费者", cityCount: 3, reportDepth: "deep" },
};

function createProject(type: ResearchProjectTypeId): QuoteProject {
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
    priceBookVersion: 1,
    createdAt: now,
    updatedAt: now,
  };
  project.lines = calculateLines(type, project.parameters);
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

function Field({ definition, value, onChange }: { definition: ParameterDefinition; value: unknown; onChange: (value: string | number | boolean) => void }) {
  if (definition.dataType === "boolean") {
    return (
      <label className="switch-field">
        <span><strong>{definition.label}</strong><small>{definition.description ?? "按实际服务范围选择"}</small></span>
        <input type="checkbox" checked={Boolean(value)} onChange={(event) => onChange(event.target.checked)} />
        <i aria-hidden="true" />
      </label>
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
  const [savedState, setSavedState] = useState("已保存在此设备");
  const [installPrompt, setInstallPrompt] = useState<Event | null>(null);

  useEffect(() => {
    getProjects().then(setProjects).catch(() => setSavedState("本地存储暂不可用"));
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

  const typeDefinition = useMemo(() => researchIndustryPack.projectTypes.find((item) => item.id === activeProject?.projectTypeId), [activeProject?.projectTypeId]);
  const totals = activeProject ? calculateTotals(activeProject) : null;
  const risks = activeProject ? getRisks(activeProject) : [];

  const startQuote = (type: ResearchProjectTypeId) => {
    setActiveProject(createProject(type));
    setView("quote");
  };

  const openProject = (project: QuoteProject) => {
    setActiveProject(project);
    setView("quote");
  };

  const updateProject = (patch: Partial<QuoteProject>) => {
    setActiveProject((current) => {
      if (!current) return current;
      const next = { ...current, ...patch, updatedAt: new Date().toISOString() };
      next.lines = calculateLines(next.projectTypeId, next.parameters);
      return next;
    });
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
          <button onClick={() => setView("privacy")} className={view === "privacy" ? "active" : ""}><span>◇</span> 数据与隐私</button>
        </nav>
        <div className="privacy-card"><div><i>✓</i><strong>本地保护已开启</strong></div><p>项目与价格数据仅保存在此设备，不会自动上传。</p><button onClick={() => setView("privacy")}>查看数据状态 →</button></div>
        <div className="sidebar-foot"><span>行业包 v{researchIndustryPack.version}.0</span><i /> <span>价格库 v1.0</span></div>
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
            <div className="quote-head"><button className="back" onClick={() => setView("dashboard")}>←</button><div><span>{typeDefinition.name}</span><input aria-label="项目名称" value={activeProject.name} onChange={(event) => updateProject({ name: event.target.value })} /><small><i /> {savedState}</small></div><div className="quote-actions"><button onClick={() => downloadCsv(activeProject)}>导出 Excel</button><button onClick={() => window.print()}>打印 / PDF</button></div></div>
            <div className="steps"><span className="done">✓<b>项目类型</b></span><i /><span className="current">2<b>需求与报价</b></span><i /><span>3<b>风险检查</b></span><i /><span>4<b>导出</b></span></div>
            <div className="quote-layout">
              <section className="form-panel panel"><div className="panel-title"><div><span>02</span><div><h2>需求参数</h2><p>字段来自 {researchIndustryPack.name}，不同类型互不干扰</p></div></div><b>{typeDefinition.parameters.filter((field) => field.required && activeProject.parameters[field.id] !== "").length}/{typeDefinition.parameters.filter((field) => field.required).length} 必填项</b></div>
                <div className="form-grid">{typeDefinition.parameters.map((definition) => <Field key={definition.id} definition={definition} value={activeProject.parameters[definition.id]} onChange={(value) => updateProject({ parameters: { ...activeProject.parameters, [definition.id]: value } })} />)}</div>
                <div className="commercial"><h3>商业规则</h3><div><label>税率 <span><input type="number" value={activeProject.taxRateBasisPoints / 100} onChange={(event) => updateProject({ taxRateBasisPoints: Number(event.target.value) * 100 })} />%</span></label><label>目标毛利率 <span><input type="number" value={activeProject.targetMarginBasisPoints / 100} onChange={(event) => updateProject({ targetMarginBasisPoints: Number(event.target.value) * 100 })} />%</span></label><label>最低毛利率 <span><input type="number" value={activeProject.minimumMarginBasisPoints / 100} onChange={(event) => updateProject({ minimumMarginBasisPoints: Number(event.target.value) * 100 })} />%</span></label></div></div>
              </section>
              <aside className="summary-column">
                <section className="panel total-card"><div className="total-label"><span>含税报价</span><b>实时测算</b></div><strong>{formatMoney(totals.totalCents)}</strong><div className="metrics"><div><span>执行成本</span><b>{formatMoney(totals.costCents)}</b></div><div><span>毛利率</span><b className={totals.marginBasisPoints < activeProject.minimumMarginBasisPoints ? "danger" : "good"}>{(totals.marginBasisPoints / 100).toFixed(1)}%</b></div><div><span>最低安全价</span><b>{formatMoney(totals.minimumSafePriceCents)}</b></div></div></section>
                <section className="panel detail-card"><div className="section-heading"><div><h2>报价明细</h2><p>{activeProject.lines.length} 项规则计算</p></div><span>可解释</span></div>{activeProject.lines.map((item) => <div className="line-item" key={item.id}><div><strong>{item.name}</strong><span>{item.detail}</span></div><b>{formatMoney(item.saleAmountCents)}</b></div>)}<div className="subtotal"><span>未税报价</span><b>{formatMoney(totals.preTaxCents)}</b></div></section>
                <section className={`panel risk-card ${risks.length ? "has-risk" : ""}`}><div><span>{risks.length ? "!" : "✓"}</span><strong>{risks.length ? `${risks.length} 项待确认` : "未发现明显漏项"}</strong></div>{risks.map((risk) => <p key={risk}>• {risk}</p>)}</section>
              </aside>
            </div>
          </div>
        )}

        {view === "privacy" && (
          <div className="page"><div className="hero-row compact"><div><span className="eyebrow">PRIVACY CENTER</span><h1>数据与隐私</h1><p>透明掌控这台设备上的业务数据。</p></div></div><div className="privacy-grid"><section className="panel privacy-overview"><span className="big-shield">✓</span><div><h2>本地优先保护正常</h2><p>未主动调用 AI 或同步时，项目名称、报价、成本、毛利和明细不会离开此设备。</p></div></section><section className="panel data-card"><h2>设备数据</h2><div><span>本地项目</span><b>{projects.length} 个</b></div><div><span>数据传输记录</span><b className="good">0 条</b></div><div><span>AI 发送记录</span><b className="good">0 条</b></div><button onClick={async () => { if (window.confirm("确定删除此设备上的全部报价项目？此操作无法撤销。")) { await deleteAllProjects(); setProjects([]); } }}>删除全部本地项目</button></section><section className="panel data-card"><h2>离线能力</h2><div><span>报价计算</span><b className="good">可用</b></div><div><span>项目保存</span><b className="good">可用</b></div><div><span>导出 CSV / PDF</span><b className="good">可用</b></div><p>首次打开后，即使断网也可以继续完成核心报价流程。</p></section></div></div>
        )}
      </section>

      <nav className="mobile-nav"><button className={view === "dashboard" ? "active" : ""} onClick={() => setView("dashboard")}>⌂<span>首页</span></button><button className={view === "quote" ? "active" : ""} onClick={() => { setActiveProject(null); setView("quote"); }}>＋<span>报价</span></button><button className={view === "projects" ? "active" : ""} onClick={() => setView("projects")}>▤<span>项目</span></button><button className={view === "privacy" ? "active" : ""} onClick={() => setView("privacy")}>◇<span>我的</span></button></nav>
    </main>
  );
}
