import type { RepositoryCandidateVerificationView } from "../../contracts/candidateReport";
import { element, emptyMessage, metadata } from "../dom";

export function renderCandidateVerification(verification: RepositoryCandidateVerificationView): HTMLElement {
    const section = element("article", undefined, "report");
    section.dataset.outcome = verification.outcome ?? verification.state;
    section.append(
        element("h4", `Verification: ${verification.outcome ?? verification.state}`),
        metadata([
            `Runner ${verification.runner.name} ${verification.runner.version}`,
            verification.environment
                ? `Environment ${verification.environment.versions
                      .map(({ name, version }) => `${name} ${version}`)
                      .join(", ")}`
                : "Environment pending",
        ]),
    );
    if (verification.suites.length === 0) {
        section.append(emptyMessage("No verification suite was planned."));
        return section;
    }
    const list = element("ul", undefined, "suite-list");
    for (const suite of verification.suites) {
        const item = element("li");
        item.append(
            element("strong", `${suite.suiteId}: ${suite.outcome ?? "planned"}`),
            metadata([
                `Source ${suite.source}`,
                suite.durationMs === undefined ? undefined : `${suite.durationMs} ms`,
                suite.attempts === undefined ? undefined : `${suite.attempts} attempt(s)`,
                suite.cacheHit === undefined ? undefined : suite.cacheHit ? "cache hit" : "cache miss",
                suite.applicable === undefined ? undefined : suite.applicable ? "applicable" : "not applicable",
            ]),
        );
        if (suite.diagnosticCodes.length > 0) {
            item.append(element("p", `Diagnostics: ${suite.diagnosticCodes.join(", ")}`, "metadata"));
        }
        list.append(item);
    }
    section.append(list);
    return section;
}
