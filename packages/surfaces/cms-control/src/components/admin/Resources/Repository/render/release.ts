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
    const environmentVersions = Object.entries(report.environment.versions).map(
        ([name, version]) => `${name} ${version}`,
    );
    section.append(
        element("h4", `Executable verification: ${report.outcome}`),
        metadata([
            `Origin ${report.origin}`,
            `Created ${report.createdAt}`,
            `Runner ${report.runner.name} ${report.runner.version}`,
            `Environment ${report.environment.digest}`,
            ...environmentVersions,
        ]),
        codeLine("Report digest", report.reportDigest),
        codeLine("Runner image", report.runner.imageDigest),
    );
    if (report.activeContracts.length > 0) {
        section.append(
            list(
                "Active contracts",
                report.activeContracts.map(
                    ({ contractId, ownerVersion, digest }) => `${contractId}@${ownerVersion} · ${digest}`,
                ),
            ),
        );
    }
    const suites = element("ul", undefined, "evidence-list");
    for (const result of report.results) {
        const suite = element(
            "li",
            `${result.suiteId} · ${result.source} · ${result.required ? "required" : "optional"} · ${result.outcome} · ${result.durationMs} ms · ${result.attempts} attempt(s)${result.cacheHit ? " · cache" : ""}`,
        );
        if (result.diagnostics.length > 0) {
            suite.append(
                list(
                    "Diagnostics",
                    result.diagnostics.map(({ code, message }) => `${code} — ${message}`),
                ),
            );
        }
        suites.append(suite);
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
        const report = section(
            `${migration.source.kind}@${migration.source.version} (${migration.supportedSourceRange}) → ${release.version}`,
            [
                `Outcome ${migration.outcome}`,
                `Origin ${migration.origin}`,
                `Runner ${migration.runner.name} ${migration.runner.version}`,
                cutoverExecution(
                    "CMS cutover",
                    migration.cutover.cmsMediated,
                    migration.cutoverEvidence?.cmsMediated.outcome,
                ),
                cutoverExecution(
                    "Provider-direct",
                    migration.cutover.providerDirect,
                    migration.cutoverEvidence?.providerDirect.outcome,
                ),
                executionStatus("Activation", migration.cutoverEvidence?.activation.outcome),
                `Rollback ${migration.rollback}`,
                `PONR ${migration.pointOfNoReturn}`,
                `Delayed cleanup ${migration.delayedCleanupVerified ? "verified" : "not verified"}`,
                ...operationalMetadata(migration),
            ],
        );
        report.append(
            codeLine("Report digest", migration.reportDigest),
            codeLine("Runner image", migration.runner.imageDigest),
            codeLine("Environment digest", migration.environmentDigest),
            list(
                "Checks",
                Object.entries(migration.checks).map(
                    ([name, result]) =>
                        `${name} · ${result.outcome}${result.evidenceDigest ? ` · ${result.evidenceDigest}` : ""}`,
                ),
            ),
        );
        target.append(report);
    }
}

function cutoverExecution(label: string, strategy: string, outcome: string | undefined): string {
    return `${label} ${strategy} · ${executionStatus("execution", outcome)}`;
}

function executionStatus(label: string, outcome: string | undefined): string {
    if (outcome === undefined) {
        return `${label} status not recorded by this legacy report`;
    }
    if (outcome === "not-supported") {
        return `${label} not-supported: declared, but not executed by the current runner`;
    }
    if (outcome === "passed") {
        return `${label} passed: executed by the runner`;
    }
    return `${label} ${outcome}`;
}

function operationalMetadata(migration: RepositoryReleaseView["migrations"][number]): string[] {
    const evidence = migration.operationalEvidence;
    if (!evidence) {
        return ["Operational evidence not recorded by this legacy report"];
    }
    const drains = [
        evidence.drain.cmsMediatedSeconds === undefined ? "" : `CMS drain ${evidence.drain.cmsMediatedSeconds}s`,
        evidence.drain.providerDirectSeconds === undefined
            ? ""
            : `provider drain ${evidence.drain.providerDirectSeconds}s`,
    ].filter(Boolean);
    return [
        evidence.downtime.status === "not-measured"
            ? "Downtime not measured by the current verifier"
            : `Downtime ${evidence.downtime.status} ${evidence.downtime.observedSeconds}s`,
        drains.length > 0 ? drains.join(" · ") : "Drain not declared",
        `Rollback proof ${evidence.rollback.verified ? "verified" : "not verified"}`,
        `PONR observation ${evidence.pointOfNoReturn.observation}`,
        `Cleanup ${evidence.cleanup.observed ? "observed" : "not observed"}${evidence.cleanup.delaySeconds === undefined ? "" : ` after ${evidence.cleanup.delaySeconds}s`}`,
    ];
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
