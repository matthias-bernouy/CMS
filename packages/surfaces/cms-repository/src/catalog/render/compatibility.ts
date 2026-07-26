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
    const outcome = summary.currentOutcome ?? summary.admissionOutcome ?? "unreported";
    return `${escapeHtml(humanLabel(outcome))}${summary.warning ? " — warning" : ""}`;
}

export function renderCompatibilityHistory(history: RepositoryCatalogCompatibilityHistory | undefined): string {
    if (!history) {
        return `<section class="compatibility"><h2>Compatibility</h2><p>No compatibility report is available for this legacy version.</p></section>`;
    }
    const reports = [history.admission, ...(history.revisions ?? [])];
    return `<section class="compatibility">
<h2>Compatibility</h2>
${history.warning ? '<p role="alert">A later compatibility assessment raised a warning for this version.</p>' : ""}
<p>Current report revision: <code>${escapeHtml(history.currentRevisionId)}</code></p>
<ol class="compatibility-history">${reports.map((report) => renderReport(report, history.currentRevisionId)).join("")}</ol>
</section>`;
}

function renderReport(report: RepositoryCatalogCompatibilityReport, currentId: string): string {
    const metadata = [
        report.packageDigest
            ? `<div><dt>Package digest</dt><dd><code>${escapeHtml(report.packageDigest)}</code></dd></div>`
            : "",
        report.evaluator
            ? `<div><dt>Evaluator</dt><dd>${escapeHtml(report.evaluator.name)} ${escapeHtml(report.evaluator.version)}</dd></div>`
            : "",
        renderBaselines("Baselines", report.baselines),
        renderBaselines("Informational baselines", report.informationalBaselines),
        report.createdAt ? `<div><dt>Created</dt><dd>${escapeHtml(report.createdAt)}</dd></div>` : "",
        report.releaseLevel ? `<div><dt>Release level</dt><dd>${escapeHtml(report.releaseLevel)}</dd></div>` : "",
        report.requiredReleaseLevel
            ? `<div><dt>Required level</dt><dd>${escapeHtml(report.requiredReleaseLevel)}</dd></div>`
            : "",
        report.admissible === undefined
            ? ""
            : `<div><dt>Admissible</dt><dd>${report.admissible ? "Yes" : "No"}</dd></div>`,
        report.supersedes ? `<div><dt>Supersedes</dt><dd><code>${escapeHtml(report.supersedes)}</code></dd></div>` : "",
        report.provenance
            ? `<div><dt>Reassessment reason</dt><dd>${escapeHtml(report.provenance.reason)}</dd></div>`
            : "",
    ].join("");
    const evidence = report.evidence ?? [];
    return `<li>
<article>
<h3>${report.reportType === "admission" ? "Admission report" : "Reassessment"}${report.id === currentId ? " (current)" : ""}</h3>
<p><code>${escapeHtml(report.id)}</code> — ${escapeHtml(humanLabel(report.outcome))}</p>
${metadata ? `<dl>${metadata}</dl>` : ""}
${evidence.length > 0 ? `<details><summary>${evidence.length} evidence item${evidence.length === 1 ? "" : "s"}</summary><ul>${evidence.map(renderEvidence).join("")}</ul></details>` : ""}
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

function renderEvidence(evidence: NonNullable<RepositoryCatalogCompatibilityReport["evidence"]>[number]): string {
    return `<li><strong>${escapeHtml(humanLabel(evidence.classification))}</strong> — ${escapeHtml(evidence.message)} <code>${escapeHtml(evidence.path)}</code> <small>${escapeHtml(evidence.surface)} / ${escapeHtml(evidence.code)}</small></li>`;
}
