import type {
    RepositoryCatalogCompatibilityHistory,
    RepositoryCatalogCompatibilityReport,
    RepositoryCatalogCompatibilitySummary,
} from "../contracts";
import { escapeHtml, humanLabel } from "./html";

export function renderCompatibilitySummary(summary: RepositoryCatalogCompatibilitySummary | undefined): string {
    if (!summary) {
        return "Unreported";
    }
    const outcome = summary.currentOutcome ?? summary.rootOutcome ?? "unreported";
    return `${escapeHtml(humanLabel(outcome))}${summary.warning ? " — warning" : ""}`;
}

export function renderCompatibilityHistory(history: RepositoryCatalogCompatibilityHistory | undefined): string {
    if (!history) {
        return `<section class="compatibility"><h2>Compatibility</h2><p>No compatibility report is available for this legacy version.</p></section>`;
    }
    const reports = [history.root, ...(history.revisions ?? [])];
    return `<section class="compatibility">
<h2>Compatibility</h2>
${history.warning ? '<p role="alert">A later compatibility assessment raised a warning for this version.</p>' : ""}
<p>Current report revision: <code>${escapeHtml(history.currentReportId)}</code></p>
<ol class="compatibility-history">${reports.map((report) => renderReport(report, history.currentReportId)).join("")}</ol>
</section>`;
}

function renderReport(report: RepositoryCatalogCompatibilityReport, currentId: string): string {
    const metadata = [
        `<div><dt>Package digest</dt><dd><code>${escapeHtml(report.packageDigest)}</code></dd></div>`,
        `<div><dt>Evaluator</dt><dd>${escapeHtml(report.evaluator.name)} ${escapeHtml(report.evaluator.version)}</dd></div>`,
        renderBaselines("Baselines", report.baselines),
        renderBaselines("Informational baselines", report.informationalBaselines),
        `<div><dt>Created</dt><dd>${escapeHtml(report.createdAt)}</dd></div>`,
        `<div><dt>Release level</dt><dd>${escapeHtml(report.releaseLevel)}</dd></div>`,
        `<div><dt>Required level</dt><dd>${escapeHtml(report.requiredReleaseLevel)}</dd></div>`,
        `<div><dt>Contract admissible</dt><dd>${report.contractAdmissible ? "Yes" : "No"}</dd></div>`,
        report.revisionType === "revision"
            ? `<div><dt>Supersedes</dt><dd><code>${escapeHtml(report.supersedes)}</code></dd></div>`
            : "",
        `<div><dt>Assessment reason</dt><dd>${escapeHtml(report.provenance.reason)}</dd></div>`,
    ].join("");
    const findings = report.findings;
    return `<li>
<article>
<h3>${report.revisionType === "root" ? "Root report" : "Reassessment"}${report.reportId === currentId ? " (current)" : ""}</h3>
<p><code>${escapeHtml(report.reportId)}</code> — ${escapeHtml(humanLabel(report.outcome))}</p>
${metadata ? `<dl>${metadata}</dl>` : ""}
${findings.length > 0 ? `<details><summary>${findings.length} finding${findings.length === 1 ? "" : "s"}</summary><ul>${findings.map(renderFinding).join("")}</ul></details>` : ""}
</article>
</li>`;
}

function renderBaselines(label: string, baselines: RepositoryCatalogCompatibilityReport["baselines"]): string {
    if (!baselines || baselines.length === 0) {
        return "";
    }
    const values = baselines
        .map(({ kind, version }) => `<code>${escapeHtml(kind)}@${escapeHtml(version)}</code>`)
        .join(", ");
    return `<div><dt>${label}</dt><dd>${values}</dd></div>`;
}

function renderFinding(finding: NonNullable<RepositoryCatalogCompatibilityReport["findings"]>[number]): string {
    return `<li><strong>${escapeHtml(humanLabel(finding.classification))}</strong> — ${escapeHtml(finding.message)} <small>${escapeHtml(finding.surface)} / ${escapeHtml(finding.code)}</small></li>`;
}
