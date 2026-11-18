import { escapeHtml } from "../html";
import type { LatencyRow, LatencySummary } from "./model";

const escape = (value: unknown) => escapeHtml(String(value));
const number = (value: number | null) => (value === null ? "unavailable" : value.toFixed(2));

function rowHtml(row: LatencyRow) {
    if (!row.report.startsWith("../")) {
        throw new Error("Summary evidence links must be relative local report paths");
    }
    const notes = [
        ...row.failure,
        ...row.findings.map((value) => value.message),
        ...row.runtime.map((value) => value.message),
    ].join("; ");
    const bad = row.status !== "passed" || row.witnessed < row.declaredSamples || !!notes;
    const cells = [
        `<b>${escape(row.contract)} · ${escape(row.capability)}</b><small>${escape(row.version)} · ${escape(row.digest)}</small>`,
        `${escape(row.scenario)} · v${row.scenarioVersion}<small>${escape(row.run)}<br>Source ${escape(row.source)}<br>Profile ${escape(row.profile)}</small>`,
        escape(row.binding),
        escape(row.variant),
        `${escape(row.status)}${notes ? `<small>${escape(notes)}</small>` : ""}`,
        `${row.witnessed}/${row.samples}/${row.declaredSamples}`,
        number(row.p50),
        number(row.p95),
        number(row.handlerP95),
        escape(row.mongoOperations ?? "unavailable"),
        escape(row.documentsExamined ?? "unavailable"),
        escape(row.internalRequests ?? "unavailable"),
        escape(row.businessMongoOperations ?? "unavailable"),
        escape(row.commonMongoOperations ?? "unavailable"),
        escape(row.responseBytes ?? "unavailable"),
        escape(row.errors),
        escape(row.budget.latencyMs),
        `<a href="${escape(row.report)}">Original report</a>`,
    ];
    return `<tr data-variant="${escape(row.variant)}" data-binding="${escape(row.binding)}" data-scope="${row.retained ? "retained" : "current"}" data-samples="${row.samples}" data-p95="${row.p95 ?? -1}" data-bad="${bad}">${cells.map((cell) => `<td>${cell}</td>`).join("")}</tr>`;
}

export function renderLatencySummary(summary: LatencySummary) {
    const select = (id: string, label: string, values: readonly string[]) =>
        `<label>${escape(label)} <select id="${id}"><option value="">All</option>${[...new Set(values)]
            .toSorted()
            .map((value) => `<option>${escape(value)}</option>`)
            .join("")}</select></label>`;
    const columns = [
        "Capability / exact release",
        "Scenario / run / source",
        "Binding",
        "Variant",
        "Result / diagnostics",
        "Witnessed / attempted / expected",
        "P50 ms",
        "P95 ms",
        "Handler P95 ms",
        "Mongo maximum",
        "Documents examined maximum",
        "Internal requests maximum",
        "Business Mongo maximum",
        "Common Mongo maximum",
        "Response bytes maximum",
        "Invalid outcomes",
        "Latency budget ms",
        "Evidence",
    ];
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1"><title>Ulvia performance history</title>
<style>body{font:14px system-ui,sans-serif;background:#f5f7fb;color:#172135;margin:28px}h1{font-size:28px}p{max-width:1100px;line-height:1.6}.controls{background:#f5f7fb;padding:12px 0}input,select,button{font:inherit;padding:8px;margin:4px}input[type=search]{width:310px}.scroll{overflow:auto;max-height:76vh;background:white}table{border-collapse:collapse;width:100%;min-width:2800px;font-size:12px}td:nth-child(1){min-width:230px}td:nth-child(2){min-width:310px}td:nth-child(5){min-width:330px}td:nth-child(3),td:nth-child(4),td:nth-child(n+6){white-space:nowrap}td:nth-child(n+6){text-align:right;font-variant-numeric:tabular-nums}th{position:sticky;top:0;background:#dfe8f4;white-space:nowrap}td,th{padding:9px;border-bottom:1px solid #dbe3ee;text-align:left;vertical-align:top}tr[data-bad=true]{background:#fff0e8}td{max-width:400px;overflow-wrap:anywhere}small{display:block;color:#526279;margin-top:4px}a{color:#0759a8}</style></head>
<body><h1>Ulvia performance history</h1>
<p>Generated ${escape(summary.generatedAt)}. ${summary.runs.length} independently recorded runs; ${summary.rows.length} scenario rows. <a href="latencies.json">Derived JSON</a>. Original sealed reports remain authoritative.</p>
<p>Diagnostic evidence, with no automatic reference selection or pooled percentiles. Each row retains its exact release, scenario version, source and environment. Fixtures and profiles may differ between runs. “Current” means current in that run's inventory, not proven current coverage of this checkout. Failed attempts remain in latency; preparation and warm-ups are excluded. With 3 or 10 samples, nearest-rank P95 equals the maximum. Async latency includes terminal completion.</p>
<p>Runtime findings and invalid outcomes remain visible. A passed business result with a budget finding is still a failed assessment. Missing metrics mean unavailable, not zero. This summary validates run seals; use the export verifier for the associated source archive and a trusted externally recorded seal for authenticity. No row is promoted to a regression reference.</p>
<div class="controls"><label>Search <input id="search" type="search" placeholder="Capability, version, scenario, run…"></label>${select(
        "variant",
        "Variant",
        summary.rows.map((row) => row.variant),
    )}${select(
        "binding",
        "Binding",
        summary.rows.map((row) => row.binding),
    )}<label>Inventory scope <select id="scope"><option value="">All</option><option value="current" selected>Current at run time</option><option value="retained">Retained at run time</option></select></label><label><input id="measured" type="checkbox" checked>Measured only</label><button id="sort">Sort by P95 descending</button><span id="count"></span></div>
<div class="scroll"><table><thead><tr>${columns.map((column) => `<th>${escape(column)}</th>`).join("")}</tr></thead><tbody id="rows">${summary.rows.map(rowHtml).join("\n")}</tbody></table></div>
<script>const controls=['search','variant','binding','scope','measured'].map(id=>document.getElementById(id));function update(){const [query,variant,binding,scope,measured]=controls;let shown=0;for(const row of document.querySelectorAll('#rows tr')){const match=row.textContent.toLowerCase().includes(query.value.toLowerCase())&&(!variant.value||row.dataset.variant===variant.value)&&(!binding.value||row.dataset.binding===binding.value)&&(!scope.value||row.dataset.scope===scope.value)&&(!measured.checked||Number(row.dataset.samples)>0);row.hidden=!match;if(match)shown++}document.getElementById('count').textContent=shown+' rows'}controls.forEach(control=>control.addEventListener('input',update));document.getElementById('sort').addEventListener('click',()=>{const body=document.getElementById('rows');[...body.children].sort((a,b)=>Number(b.dataset.p95)-Number(a.dataset.p95)).forEach(row=>body.appendChild(row));update()});update();</script></body></html>`;
}
