import type { Comparison, RunReport } from "./types";
import { resultSummary } from "./results";
import { initializationPhaseRows } from "./phases";

export function escapeHtml(value: string): string {
    return value
        .replaceAll("&", "&amp;")
        .replaceAll("<", "&lt;")
        .replaceAll(">", "&gt;")
        .replaceAll('"', "&quot;")
        .replaceAll("'", "&#39;");
}

export function renderReport(report: RunReport, comparison?: Comparison): string {
    const escape = (value: unknown) => escapeHtml(String(value));
    const current = report.inventory.targets.filter((target) => !target.retained).length;
    const retained = report.inventory.targets.length - current;
    const covered = report.coverage.filter((row) => row.status === "covered").length;
    const rows = report.coverage
        .map(
            (row) =>
                `<tr data-state="${escape(row.status)}"><td>${escape(row.obligation.target)}</td><td>${escape(row.obligation.binding)}</td><td>${escape(row.obligation.variant)}</td><td>${escape(row.scenarios.join(", "))}</td><td>${row.successful}/${row.measured}</td><td>${escape(row.status)}</td></tr>`,
        )
        .join("\n");
    const failures = [...report.findings, ...(comparison?.findings ?? [])]
        .map(
            (finding) =>
                `<li><strong>${escape(finding.code)}</strong> ${escape(finding.scenario ?? finding.obligation?.target ?? "")} — ${escape(finding.message)}</li>`,
        )
        .join("\n");
    const changes =
        comparison?.changes
            .map(
                (change) =>
                    `<tr><td>${escape(change.scenario)}</td><td>${change.referenceP95Ms.toFixed(2)}</td><td>${change.candidateP95Ms.toFixed(2)}</td><td>${change.deltaMs.toFixed(2)}</td><td>${change.regressed ? "regression" : "within limits"}</td></tr>`,
            )
            .join("\n") ?? "";
    return `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Ulvia performance assessment</title>
<style>body{font:15px system-ui,sans-serif;margin:32px;color:#172135;background:#f6f8fb}main{max-width:1500px;margin:auto}h1{font-size:30px}p{line-height:1.6}table{border-collapse:collapse;width:100%;background:white;font-size:13px}td,th{padding:10px;text-align:left;border-bottom:1px solid #dde3ed;vertical-align:top;overflow-wrap:anywhere}th{background:#e8edf5;position:sticky;top:0}input,select{font:inherit;padding:8px;margin:0 8px 16px 0}tr[data-state=covered]{background:#edf8f1}tr[data-state=missing-plan],tr[data-state=uncovered]{background:#fff1ec}.scroll{overflow:auto}li{margin-bottom:8px}code{overflow-wrap:anywhere}</style></head>
<body><main><h1>Ulvia performance assessment · ${escape(report.status)}</h1>
<p>Run <code>${escape(report.metadata.id)}</code> · ${escape(report.metadata.finishedAt)}<br>Revision <code>${escape(report.metadata.revision)}</code>${report.metadata.dirty ? " (modified working tree)" : ""}<br>Source fingerprint <code>${escape(report.metadata.sourceDigest)}</code></p>
<p>Exact source archive: <code>${escape(report.metadata.sourceArchive?.archiveSha256 ?? "not recorded by this historical producer")}</code></p>
<p>${report.metadata.selection ? `Targeted assessment: ${report.scenarios.length}/${escape(report.metadata.selection.plannedScenarios)} planned scenarios selected. Coverage below applies only to this selection; this is not an exhaustive assessment.` : "Assessment of all scenarios declared for the recorded inventory."}</p>
<p>${current} current execution targets · ${retained} retained execution targets · ${report.inventory.templates.length} non-executable templates.<br>${covered}/${report.coverage.length} required binding/variant obligations covered. Planning and actual measurement are distinct.</p>
<p>Reference: ${escape(comparison?.reference ?? "not supplied")} · Comparison: ${comparison?.reference ? (comparison.comparable ? "comparable" : "incomplete or incompatible") : "not requested"}. Results describe this run; they are not a production availability guarantee.</p>
<h2>Findings and correction backlog</h2><ul>${failures || "<li>No recorded findings.</li>"}</ul>
<h2>Measured scenarios</h2><p>Preparation calls are excluded. Latency includes failed attempts; valid/attempted counts distinguish successful business results and complete invocation evidence. Work and byte columns show the maximum per measured request. Handler and business/common Mongo columns separate the requested capability from shared work. Async polling is charged separately; client latency includes terminal completion.</p>
<div class="scroll"><table><thead><tr><th>Scenario</th><th>Assessment</th><th>Valid/attempted</th><th>Client p50 ms</th><th>Client p95 ms</th><th>Mongo operations</th><th>Documents examined</th><th>Internal requests</th><th>Internal response bytes</th><th>Client response bytes</th><th>Handler p95 ms</th><th>Business Mongo</th><th>Common Mongo</th><th>Polling Mongo</th><th>Actual requests/min</th><th>Errors/timeouts</th></tr></thead><tbody>${resultSummary(report, escape)}</tbody></table></div>
<h2>Capability coverage</h2><label>Filter <input id="filter" type="search" placeholder="Capability, scenario or binding"></label><label>Status <select id="state"><option value="">All</option><option>covered</option><option>missing-plan</option><option>unattempted</option><option>uncovered</option></select></label>
${report.results.some((result) => result.measurements.some((sample) => sample.phases?.length)) ? `<h2>Initialization phases</h2><p>Inclusive wall times overlap and must not be added. Failed calls remain visible. A missing phase means unobserved work, never zero cost. Post-response Provider settlement is excluded from client latency.</p><div class="scroll"><table id="initialization-phases"><thead><tr><th>Scenario</th><th>Phase</th><th>Observed/attempted</th><th>Maximum calls/request</th><th>Failed phase calls</th><th>Total/request p95 ms</th><th>Maximum call ms</th></tr></thead><tbody>${initializationPhaseRows(report, escapeHtml)}</tbody></table></div>` : ""}
<div class="scroll"><table id="coverage"><thead><tr><th>Exact capability</th><th>Binding</th><th>Variant</th><th>Declared scenarios</th><th>Successful/measured</th><th>Status</th></tr></thead><tbody>${rows}</tbody></table></div>
<h2>Latency comparison</h2><div class="scroll"><table><thead><tr><th>Scenario</th><th>Reference p95 ms</th><th>Candidate p95 ms</th><th>Delta ms</th><th>Assessment</th></tr></thead><tbody>${changes}</tbody></table></div>
<p>Raw samples, image identities, fixture fingerprints, budgets and environment profile are in results.json. No request bodies, response bodies or credentials are included.</p></main>
<script>const filter=document.querySelector('#filter');const state=document.querySelector('#state');function update(){const query=filter.value.toLowerCase();for(const row of document.querySelectorAll('#coverage tbody tr')){row.hidden=!row.textContent.toLowerCase().includes(query)||(state.value&&row.dataset.state!==state.value)}}filter.addEventListener('input',update);state.addEventListener('change',update);</script></body></html>`;
}
