import type {
    RepositoryCompatibilityBaselineView,
    RepositoryCompatibilityPageView,
    RepositoryCompatibilityReportView,
} from "../contracts/types";
import { element, emptyMessage, metadata } from "./dom";

export function renderRepositoryCompatibility(target: HTMLElement, page: RepositoryCompatibilityPageView): void {
    const fragment = document.createDocumentFragment();
    fragment.append(
        reportSection("Current report", page.current),
        reportSection("Root report", page.root),
        element("h3", `Revision history (${page.totalRevisions})`),
    );
    if (page.revisions.length === 0) {
        fragment.append(emptyMessage("No compatibility reevaluation has been recorded."));
    } else {
        fragment.append(...page.revisions.map((report) => reportSection("Revision", report)));
    }
    target.replaceChildren(fragment);
}

function reportSection(title: string, report: RepositoryCompatibilityReportView): HTMLElement {
    const section = element("article", undefined, "report");
    section.dataset.outcome = report.outcome;
    section.append(
        element("h4", `${title}: ${report.outcome}`),
        metadata([
            `ID ${report.reportId}`,
            `Created ${report.createdAt}`,
            `Release ${report.releaseLevel}`,
            `Required ${report.requiredReleaseLevel}`,
            `Evaluator ${report.evaluator.name} ${report.evaluator.version}`,
        ]),
        codeLine("Package digest", report.packageDigest),
    );
    if (report.supersedes) {
        section.append(codeLine("Supersedes", report.supersedes));
    }
    if (report.noBaselineReason) {
        section.append(element("p", `No baseline: ${report.noBaselineReason}`));
    }
    appendBaselines(section, "Baselines", report.baselines);
    appendBaselines(section, "Informational baselines", report.informationalBaselines);
    section.append(element("h5", "Findings"));
    if (report.findings.length === 0) {
        section.append(emptyMessage("No compatibility findings."));
    } else {
        const list = element("ul", undefined, "evidence-list");
        for (const finding of report.findings) {
            const item = element("li");
            item.append(
                element("strong", `${finding.classification} · ${finding.surface} · ${finding.code}`),
                document.createTextNode(` — ${finding.message}`),
            );
            list.append(item);
        }
        section.append(list);
    }
    section.append(
        element("h5", "Assessment provenance"),
        element("p", report.provenance.reason),
        codeLine("Evidence IDs", report.provenance.evidenceIds.join(", ") || "None"),
    );
    return section;
}

function appendBaselines(
    target: HTMLElement,
    title: string,
    baselines: readonly RepositoryCompatibilityBaselineView[],
): void {
    if (baselines.length === 0) {
        return;
    }
    target.append(element("h5", title));
    const list = element("ul", undefined, "metadata");
    for (const baseline of baselines) {
        list.append(element("li", `${baseline.kind}@${baseline.version} · ${baseline.packageDigest}`));
    }
    target.append(list);
}

function codeLine(label: string, value: string): HTMLElement {
    const line = element("p", undefined, "metadata");
    line.append(document.createTextNode(`${label}: `), element("code", value));
    return line;
}
