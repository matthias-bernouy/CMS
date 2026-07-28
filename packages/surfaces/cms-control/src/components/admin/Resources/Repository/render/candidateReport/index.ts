import type {
    RepositoryCandidateCompatibilityView,
    RepositoryCandidateReportView,
} from "../../contracts/candidateReport";
import { element, emptyMessage, metadata } from "../dom";
import { renderCandidateMigrations } from "./migrations";
import { renderCandidateVerification } from "./verification";

export function renderRepositoryCandidateReport(target: HTMLElement, report: RepositoryCandidateReportView): void {
    const section = element("section", undefined, "candidate-report");
    section.append(
        element("h3", `Admission report for ${report.candidate.kind}@${report.candidate.version}`),
        metadata([
            `Candidate ${report.candidate.candidateId}`,
            `Status ${report.candidate.status}`,
            `Attempt ${report.candidate.attemptCount}`,
        ]),
        codeLine("Package digest", report.candidate.packageDigest),
        codeLine("Verification digest", report.candidate.verificationDigest),
    );
    section.append(
        report.compatibility ? renderCompatibility(report.compatibility) : pending("Compatibility was not evaluated."),
        report.verification
            ? renderCandidateVerification(report.verification)
            : pending("Verification was not planned."),
        renderCandidateMigrations(report.migrations),
    );
    target.replaceChildren(section);
}

function renderCompatibility(compatibility: RepositoryCandidateCompatibilityView): HTMLElement {
    const section = element("article", undefined, "report");
    section.dataset.outcome = compatibility.outcome;
    section.append(
        element("h4", `Compatibility: ${compatibility.outcome}`),
        metadata([
            `Contract ${compatibility.contractAdmissible ? "admissible" : "not admissible"}`,
            `Release ${compatibility.releaseLevel}`,
            `Required ${compatibility.requiredReleaseLevel}`,
            `${compatibility.baselines.length} blocking baseline(s)`,
            `${compatibility.informationalBaselines.length} informational baseline(s)`,
        ]),
    );
    if (compatibility.findings.length === 0) {
        section.append(emptyMessage("No compatibility findings."));
    } else {
        const list = element("ul", undefined, "evidence-list");
        for (const finding of compatibility.findings) {
            const item = element("li");
            item.append(
                element("strong", `${finding.classification} · ${finding.surface} · ${finding.code}`),
                document.createTextNode(` — ${finding.path}: ${finding.message}`),
            );
            list.append(item);
        }
        section.append(list);
    }
    return section;
}

function pending(message: string): HTMLElement {
    const section = element("article", undefined, "report");
    section.append(emptyMessage(message));
    return section;
}

function codeLine(label: string, value: string): HTMLElement {
    const line = element("p", undefined, "metadata");
    line.append(document.createTextNode(`${label}: `), element("code", value));
    return line;
}
