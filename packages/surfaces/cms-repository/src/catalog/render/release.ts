import type { PublicRepositoryRelease } from "../../compatibility/releaseContracts";
import { repositoryVerificationBundleDownloadPath } from "../routes";
import { escapeAttr, escapeHtml, humanLabel } from "./html";

export function renderReleaseEvidence(release: PublicRepositoryRelease | undefined): string {
    if (!release) {
        return '<section class="release-evidence"><h2>Release admission</h2><p>No composite release evidence is available.</p></section>';
    }
    return `<section class="release-evidence"><h2>Release admission</h2>
${release.status === "blocked" ? '<p role="alert">This version is blocked for new installations and upgrades. Exact downloads and pinned reruns remain available.</p>' : ""}
${release.freshInstallOnly ? '<p role="alert">This version is fresh-install-only because no exact passed migration path covers every required source.</p>' : ""}
<dl>
<div><dt>Status</dt><dd>${escapeHtml(humanLabel(release.status))}</dd></div>
<div><dt>Installable</dt><dd>${release.installable ? "Yes" : "No"}</dd></div>
<div><dt>Package digest</dt><dd><code>${escapeHtml(release.packageDigest)}</code></dd></div>
${release.verificationDigest ? `<div><dt>Verification bundle</dt><dd><a href="${escapeAttr(repositoryVerificationBundleDownloadPath(release.verificationDigest))}" download><code>${escapeHtml(release.verificationDigest)}</code></a></dd></div>` : ""}
</dl>
${renderDecision(release)}
${renderVerification(release)}
${renderStaticCompatibility(release)}
${renderMigrations(release)}
</section>`;
}

function renderDecision(release: PublicRepositoryRelease): string {
    const decision = release.decision;
    if (!decision) {
        return "<h3>Composite decision</h3><p>No exact release admission decision is available.</p>";
    }
    return `<h3>Composite decision</h3><dl>
<div><dt>Decision</dt><dd><code>${escapeHtml(decision.decisionId)}</code></dd></div>
<div><dt>Digest</dt><dd><code>${escapeHtml(decision.decisionDigest)}</code></dd></div>
<div><dt>Admissible</dt><dd>${decision.admissible ? "Yes" : "No"}</dd></div>
<div><dt>Policy</dt><dd>${escapeHtml(decision.policy.name)} ${escapeHtml(decision.policy.version)} · <code>${escapeHtml(decision.policy.snapshotDigest)}</code></dd></div>
</dl>${decision.reasons.length > 0 ? `<p>Reasons: ${decision.reasons.map(escapeHtml).join(", ")}</p>` : ""}`;
}

function renderVerification(release: PublicRepositoryRelease): string {
    const verification = release.verification;
    if (!verification) {
        return "<h3>Executable verification</h3><p>No verification report is available.</p>";
    }
    const versions = Object.entries(verification.environment.versions)
        .map(([name, version]) => `${escapeHtml(name)} ${escapeHtml(version)}`)
        .join(", ");
    return `<h3>Executable verification</h3><dl>
<div><dt>Origin</dt><dd>${escapeHtml(humanLabel(verification.origin))}</dd></div>
<div><dt>Created</dt><dd><time datetime="${escapeAttr(verification.createdAt)}">${escapeHtml(verification.createdAt)}</time></dd></div>
<div><dt>Outcome</dt><dd>${escapeHtml(humanLabel(verification.outcome))}</dd></div>
<div><dt>Report</dt><dd><code>${escapeHtml(verification.reportId)}</code> · <code>${escapeHtml(verification.reportDigest)}</code></dd></div>
<div><dt>Runner</dt><dd>${escapeHtml(verification.runner.name)} ${escapeHtml(verification.runner.version)} · <code>${escapeHtml(verification.runner.imageDigest)}</code></dd></div>
<div><dt>Environment</dt><dd><code>${escapeHtml(verification.environment.digest)}</code>${versions ? ` · ${versions}` : ""}</dd></div>
<div><dt>Active contracts</dt><dd>${verification.activeContracts.length > 0 ? verification.activeContracts.map(({ contractId, ownerVersion, digest }) => `<code>${escapeHtml(contractId)}@${escapeHtml(ownerVersion)} · ${escapeHtml(digest)}</code>`).join(", ") : "None"}</dd></div>
</dl><ul>${verification.results
        .map(
            (result) =>
                `<li><strong>${escapeHtml(result.suiteId)}</strong> — ${escapeHtml(humanLabel(result.outcome))} (${escapeHtml(result.source)}, ${result.durationMs} ms, ${result.attempts} attempt${result.attempts === 1 ? "" : "s"})${result.diagnostics.length > 0 ? `<ul>${result.diagnostics.map(({ code, message }) => `<li><code>${escapeHtml(code)}</code> ${escapeHtml(message)}</li>`).join("")}</ul>` : ""}</li>`,
        )
        .join("")}</ul>`;
}

function renderStaticCompatibility(release: PublicRepositoryRelease): string {
    const compatibility = release.compatibility;
    if (!compatibility) {
        return "<h3>Static compatibility</h3><p>No static compatibility report is available.</p>";
    }
    return `<h3>Static compatibility</h3><dl>
<div><dt>Origin</dt><dd>${escapeHtml(humanLabel(compatibility.origin))}</dd></div>
<div><dt>Outcome</dt><dd>${escapeHtml(humanLabel(compatibility.outcome))}</dd></div>
<div><dt>Contract admissible</dt><dd>${compatibility.contractAdmissible ? "Yes" : "No"}</dd></div>
<div><dt>Release level</dt><dd>${escapeHtml(compatibility.releaseLevel)} (required ${escapeHtml(compatibility.requiredReleaseLevel)})</dd></div>
</dl>${compatibility.baselines.length > 0 ? `<p>Baselines: ${compatibility.baselines.map(({ kind, version, packageDigest }) => `<code>${escapeHtml(kind)}@${escapeHtml(version)} · ${escapeHtml(packageDigest)}</code>`).join(", ")}</p>` : ""}
${compatibility.findings.length > 0 ? `<ul>${compatibility.findings.map(({ findingId, classification, surface, path, code, message }) => `<li><strong>${escapeHtml(humanLabel(classification))}</strong> ${escapeHtml(message)} <code>${escapeHtml(surface)}:${escapeHtml(path)}:${escapeHtml(code)}:${escapeHtml(findingId)}</code></li>`).join("")}</ul>` : "<p>No compatibility finding.</p>"}`;
}

function renderMigrations(release: PublicRepositoryRelease): string {
    if (release.migrations.length === 0) {
        return "<h3>Migration support</h3><p>No source-to-target migration report is published.</p>";
    }
    return `<h3>Migration support</h3><ol>${release.migrations
        .map(
            (
                migration,
            ) => `<li><article><h4>${escapeHtml(migration.connectorKey)} from ${escapeHtml(migration.supportedSourceRange)}</h4><dl>
<div><dt>Outcome</dt><dd>${escapeHtml(humanLabel(migration.outcome))}</dd></div>
<div><dt>Report</dt><dd><code>${escapeHtml(migration.reportId)}</code> · <code>${escapeHtml(migration.reportDigest)}</code></dd></div>
<div><dt>Source</dt><dd><code>${escapeHtml(migration.source.kind)}@${escapeHtml(migration.source.version)} · ${escapeHtml(migration.source.packageDigest)}</code></dd></div>
<div><dt>Lineage / revision</dt><dd><code>${escapeHtml(migration.lineageId)}</code> / ${migration.migrationRevision}</dd></div>
<div><dt>Runner</dt><dd>${escapeHtml(migration.runner.name)} ${escapeHtml(migration.runner.version)} · <code>${escapeHtml(migration.runner.imageDigest)}</code></dd></div>
<div><dt>Environment</dt><dd><code>${escapeHtml(migration.environmentDigest)}</code></dd></div>
<div><dt>Rollback</dt><dd>${escapeHtml(humanLabel(migration.rollback))}</dd></div>
<div><dt>Point of no return</dt><dd>${escapeHtml(migration.pointOfNoReturn)}</dd></div>
<div><dt>CMS-mediated cutover</dt><dd>${escapeHtml(humanLabel(migration.cutover.cmsMediated))}</dd></div>
<div><dt>Provider-direct cutover</dt><dd>${escapeHtml(humanLabel(migration.cutover.providerDirect))}</dd></div>
<div><dt>Delayed cleanup verified</dt><dd>${migration.delayedCleanupVerified ? "Yes" : "No"}</dd></div>
${renderOperationalEvidence(migration)}
</dl>${renderMigrationChecks(migration.checks)}</article></li>`,
        )
        .join("")}</ol>`;
}

function renderOperationalEvidence(migration: PublicRepositoryRelease["migrations"][number]): string {
    const evidence = migration.operationalEvidence;
    if (!evidence) {
        return "<div><dt>Operational evidence</dt><dd>Not recorded by this legacy report.</dd></div>";
    }
    const downtime =
        evidence.downtime.status === "not-measured"
            ? "Not measured by the current verifier"
            : `${humanLabel(evidence.downtime.status)} · ${evidence.downtime.observedSeconds}s · ${evidence.downtime.evidenceDigest}`;
    const drains = [
        evidence.drain.cmsMediatedSeconds === undefined ? "" : `CMS-mediated ${evidence.drain.cmsMediatedSeconds}s`,
        evidence.drain.providerDirectSeconds === undefined
            ? ""
            : `provider-direct ${evidence.drain.providerDirectSeconds}s`,
    ].filter(Boolean);
    return `<div><dt>Downtime</dt><dd>${escapeHtml(downtime)}</dd></div>
<div><dt>Drain / grace</dt><dd>${drains.length ? escapeHtml(drains.join(", ")) : "Not declared"}</dd></div>
<div><dt>Rollback proof</dt><dd>${evidence.rollback.verified ? "Verified" : "Not verified"}${evidence.rollback.evidenceDigest ? ` · <code>${escapeHtml(evidence.rollback.evidenceDigest)}</code>` : ""}</dd></div>
<div><dt>PONR observation</dt><dd>${escapeHtml(humanLabel(evidence.pointOfNoReturn.observation))}${evidence.pointOfNoReturn.evidenceDigest ? ` · <code>${escapeHtml(evidence.pointOfNoReturn.evidenceDigest)}</code>` : ""}</dd></div>
<div><dt>Cleanup evidence</dt><dd>${evidence.cleanup.observed ? "Observed" : "Not observed"}${evidence.cleanup.delaySeconds === undefined ? "" : ` after ${evidence.cleanup.delaySeconds}s`}${evidence.cleanup.evidenceDigest ? ` · <code>${escapeHtml(evidence.cleanup.evidenceDigest)}</code>` : ""}</dd></div>`;
}

function renderMigrationChecks(checks: PublicRepositoryRelease["migrations"][number]["checks"]): string {
    const entries = Object.entries(checks);
    if (entries.length === 0) {
        return "<p>No migration check result is available.</p>";
    }
    return `<h5>Checks</h5><ul>${entries
        .map(
            ([name, result]) =>
                `<li><strong>${escapeHtml(humanLabel(name))}</strong> — ${escapeHtml(humanLabel(result.outcome))}${result.evidenceDigest ? ` · <code>${escapeHtml(result.evidenceDigest)}</code>` : ""}</li>`,
        )
        .join("")}</ul>`;
}
