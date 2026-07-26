import type { RepositoryReleaseView } from "../contracts/release/types";
import { element, emptyMessage, metadata } from "./dom";

export function renderRepositoryRelease(target: HTMLElement, release: RepositoryReleaseView): void {
    const fragment = document.createDocumentFragment();
    fragment.append(
        section("Release admission", [
            `Status ${release.status}`,
            `Installable ${release.installable ? "yes" : "no"}`,
            `Fresh-install-only ${release.freshInstallOnly ? "yes" : "no"}`,
        ]),
        codeLine("Package digest", release.packageDigest),
    );
    if (release.verificationDigest) {
        fragment.append(codeLine("Verification bundle digest", release.verificationDigest));
    }
    appendDecision(fragment, release);
    appendVerification(fragment, release);
    appendCompatibility(fragment, release);
    appendMigrations(fragment, release);
    target.replaceChildren(fragment);
}

function appendDecision(target: DocumentFragment, release: RepositoryReleaseView): void {
    if (!release.decision) {
        target.append(emptyMessage("No composite release decision is available."));
        return;
    }
    const decision = element("article", undefined, "report");
    decision.dataset.outcome = release.decision.admissible ? "compatible" : "breaking";
    decision.append(
        element("h4", `Composite decision: ${release.decision.admissible ? "admissible" : "rejected"}`),
        metadata([`ID ${release.decision.decisionId}`, `Created ${release.decision.createdAt}`]),
        codeLine("Decision digest", release.decision.decisionDigest),
    );
    if (release.decision.reasons.length > 0) {
        decision.append(list("Decision reasons", release.decision.reasons));
    }
    target.append(decision);
}

function appendVerification(target: DocumentFragment, release: RepositoryReleaseView): void {
    const report = release.verification;
    if (!report) {
        target.append(emptyMessage("No executable verification report is available."));
        return;
    }
    const section = element("article", undefined, "report");
    section.dataset.outcome = report.outcome;
    section.append(
        element("h4", `Executable verification: ${report.outcome}`),
        metadata([
            `Origin ${report.origin}`,
            `Runner ${report.runner.name} ${report.runner.version}`,
            `Environment ${report.environment.digest}`,
        ]),
        codeLine("Runner image", report.runner.imageDigest),
    );
    const suites = element("ul", undefined, "evidence-list");
    for (const result of report.results) {
        suites.append(
            element(
                "li",
                `${result.suiteId} · ${result.source} · ${result.outcome} · ${result.attempts} attempt(s)${result.cacheHit ? " · cache" : ""}`,
            ),
        );
    }
    section.append(element("h5", "Suites"), suites);
    target.append(section);
}

function appendCompatibility(target: DocumentFragment, release: RepositoryReleaseView): void {
    const report = release.compatibility;
    if (!report) {
        target.append(emptyMessage("No static compatibility report is available."));
        return;
    }
    const section = element("article", undefined, "report");
    section.dataset.outcome = report.outcome;
    section.append(
        element("h4", `Static compatibility: ${report.outcome}`),
        metadata([
            `Origin ${report.origin}`,
            `Release ${report.releaseLevel}`,
            `Required ${report.requiredReleaseLevel}`,
        ]),
        codeLine("Report digest", report.reportDigest),
    );
    if (report.findings.length > 0) {
        section.append(
            list(
                "Findings",
                report.findings.map(
                    (finding) =>
                        `${finding.classification} · ${finding.surface}:${finding.path} · ${finding.code} — ${finding.message}`,
                ),
            ),
        );
    }
    target.append(section);
}

function appendMigrations(target: DocumentFragment, release: RepositoryReleaseView): void {
    target.append(element("h4", "Migration support"));
    if (release.migrations.length === 0) {
        target.append(
            emptyMessage("No tested in-place source range; treat this release as fresh-install-only when required."),
        );
        return;
    }
    for (const migration of release.migrations) {
        target.append(
            section(
                `${migration.source.kind}@${migration.source.version} (${migration.supportedSourceRange}) → ${release.version}`,
                [
                    `Outcome ${migration.outcome}`,
                    `Origin ${migration.origin}`,
                    `CMS cutover ${migration.cutover.cmsMediated}`,
                    `Provider-direct ${migration.cutover.providerDirect}`,
                    `Rollback ${migration.rollback}`,
                    `PONR ${migration.pointOfNoReturn}`,
                    `Delayed cleanup ${migration.delayedCleanupVerified ? "verified" : "not verified"}`,
                ],
            ),
        );
    }
}

function section(title: string, parts: readonly string[]): HTMLElement {
    const node = element("article", undefined, "report");
    node.append(element("h4", title), metadata(parts));
    return node;
}

function codeLine(label: string, value: string): HTMLElement {
    const line = element("p", undefined, "metadata");
    line.append(document.createTextNode(`${label}: `), element("code", value));
    return line;
}

function list(title: string, entries: readonly string[]): HTMLElement {
    const container = element("div");
    const values = element("ul", undefined, "evidence-list");
    values.append(...entries.map((value) => element("li", value)));
    container.append(element("h5", title), values);
    return container;
}
