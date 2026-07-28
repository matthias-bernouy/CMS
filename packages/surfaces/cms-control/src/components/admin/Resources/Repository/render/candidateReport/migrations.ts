import type {
    RepositoryCandidateMigrationView,
    RepositoryCandidateObservationView,
    RepositoryCandidateTargetObservationView,
} from "../../contracts/candidateReport";
import { element, emptyMessage, metadata } from "../dom";

export function renderCandidateMigrations(migrations: readonly RepositoryCandidateMigrationView[]): HTMLElement {
    const section = element("article", undefined, "report");
    section.append(element("h4", `Migration verification (${migrations.length})`));
    if (migrations.length === 0) {
        section.append(emptyMessage("No migration input was planned for this candidate."));
        return section;
    }
    for (const migration of migrations) {
        section.append(renderMigration(migration));
    }
    return section;
}

function renderMigration(migration: RepositoryCandidateMigrationView): HTMLElement {
    const section = element("section", undefined, "migration-report");
    section.append(
        element("h5", `${migration.source.version} → ${migration.target.version}`),
        metadata([
            `Connector ${migration.connectorKey}`,
            `Lineage ${migration.lineageId}`,
            `Revisions ${migration.sourceMigrationRevision} → ${migration.targetMigrationRevision}`,
            `Source range ${migration.supportedSourceRange}`,
        ]),
        codeLine("Migration input", migration.migrationInputDigest),
        codeLine("Source package", migration.source.packageDigest),
        codeLine("Target package", migration.target.packageDigest),
    );
    if (!migration.result) {
        section.append(emptyMessage("Migration verification is pending."));
        return section;
    }
    const result = migration.result;
    section.append(
        metadata([`Runner ${result.runnerDigest}`, `Environment ${result.environmentDigest}`]),
        targetState("Fresh target", result.freshTarget),
        targetState("Migrated target", result.migratedTarget),
        observation(
            "Equivalence",
            result.equivalence,
            `equivalent ${displayBoolean(result.equivalence.equivalent)} · ${result.equivalence.differenceCount} difference(s)`,
        ),
        observation(
            "Ledger",
            result.ledger,
            [
                `revision ${result.ledger.sourceRevision ?? "?"} → ${result.ledger.targetRevision ?? "?"}`,
                `atomic ${displayBoolean(result.ledger.migrationAndLedgerAtomic)}`,
                `checksum rejection ${displayBoolean(result.ledger.checksumMismatchRejected)}`,
                `empty-ledger rejection ${displayBoolean(result.ledger.emptyLedgerRejected)}`,
                `rows ${result.ledger.migrationIds.join(", ") || "none"}`,
            ].join(" · "),
        ),
        observation(
            "Replay",
            result.replay,
            `unchanged ${displayBoolean(result.replay.unchanged)} · rows ${result.replay.ledgerRowsBefore ?? "?"}/${result.replay.ledgerRowsAfterFirstRun ?? "?"}/${result.replay.ledgerRowsAfterReplay ?? "?"}`,
        ),
        observation(
            "CMS-mediated cutover",
            result.cutover.cmsMediated,
            `${result.cutover.cmsMediated.strategy} · ${result.cutover.cmsMediated.bindingRevisionBefore ?? "?"} → ${result.cutover.cmsMediated.bindingRevisionAfter ?? "?"}`,
        ),
        observation(
            "Provider-direct cutover",
            result.cutover.providerDirect,
            `${result.cutover.providerDirect.strategy} · callbacks ${result.cutover.providerDirect.callbackIds.join(", ") || "none"} · signing continuity ${displayBoolean(result.cutover.providerDirect.signingSecretContinuityObserved)}`,
        ),
        observation(
            "Activation",
            result.cutover.activation,
            `point of no return ${displayBoolean(result.cutover.activation.pointOfNoReturnCrossed)} · cleanup ${displayBoolean(result.cutover.activation.cleanupObserved)}`,
        ),
    );
    return section;
}

function targetState(title: string, target: RepositoryCandidateTargetObservationView): HTMLElement {
    return observation(
        title,
        target,
        `state ${target.stateDigest ?? "not recorded"} · schema ${target.schemaDigest ?? "not recorded"} · data ${target.dataDigest ?? "not recorded"} · functions ${target.functionDigests.length}`,
    );
}

function observation(title: string, value: RepositoryCandidateObservationView, detail: string): HTMLElement {
    const node = element("div", undefined, "candidate-observation");
    node.append(
        element("strong", `${title}: ${value.status}`),
        metadata([
            detail,
            value.diagnosticCodes.length > 0 ? `Diagnostics ${value.diagnosticCodes.join(", ")}` : undefined,
            value.evidenceDigests.length > 0 ? `${value.evidenceDigests.length} evidence object(s)` : undefined,
        ]),
    );
    return node;
}

function displayBoolean(value: boolean | undefined): string {
    return value === undefined ? "not recorded" : value ? "yes" : "no";
}

function codeLine(label: string, value: string): HTMLElement {
    const line = element("p", undefined, "metadata");
    line.append(document.createTextNode(`${label}: `), element("code", value));
    return line;
}
