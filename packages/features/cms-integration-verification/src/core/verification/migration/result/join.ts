import type {
    MigrationJobAttemptIdentityV1,
    MigrationJobResultV1,
    MigrationVerificationInputV1,
} from "../../../../interfaces/verification/migration";
import { invalid } from "../shared";

export function assertRawObservationsMatchInput(
    result: MigrationJobResultV1,
    input: MigrationVerificationInputV1,
    attempt: MigrationJobAttemptIdentityV1,
): void {
    const { observations } = result;
    assertObservationDependencies(result, input);
    if (
        observations.equivalence.freshStateDigest &&
        observations.freshTarget.stateDigest &&
        observations.equivalence.freshStateDigest !== observations.freshTarget.stateDigest
    ) {
        invalid("migrationJobResult.observations.equivalence", "substitutes the fresh target state digest");
    }
    if (
        observations.equivalence.migratedStateDigest &&
        observations.migratedTarget.stateDigest &&
        observations.equivalence.migratedStateDigest !== observations.migratedTarget.stateDigest
    ) {
        invalid("migrationJobResult.observations.equivalence", "substitutes the migrated target state digest");
    }
    if (
        observations.replay.firstStateDigest &&
        observations.migratedTarget.stateDigest &&
        observations.replay.firstStateDigest !== observations.migratedTarget.stateDigest
    ) {
        invalid("migrationJobResult.observations.replay", "substitutes the first migrated target state digest");
    }
    assertLedger(observations.ledger, input, attempt);
    assertCutover(observations.cutover, input);
}

function assertObservationDependencies(result: MigrationJobResultV1, input: MigrationVerificationInputV1): void {
    const { observations } = result;
    const equivalenceObserved = observedOutcome(observations.equivalence.status);
    if (
        equivalenceObserved &&
        (observations.freshTarget.status !== "passed" ||
            observations.migratedTarget.status !== "passed" ||
            observations.equivalence.freshStateDigest !== observations.freshTarget.stateDigest ||
            observations.equivalence.migratedStateDigest !== observations.migratedTarget.stateDigest)
    ) {
        invalid(
            "migrationJobResult.observations.equivalence",
            "must compare the exact passed fresh and migrated target observations",
        );
    }
    const replayObserved = observedOutcome(observations.replay.status);
    const sourceLedgerRows = input.migrationPlan.plan.install.coveredMigrations.filter(
        (entry) => entry.revision <= input.sourceMigrationRevision,
    ).length;
    if (
        replayObserved &&
        (observations.migratedTarget.status !== "passed" ||
            observations.ledger.status !== "passed" ||
            observations.replay.firstStateDigest !== observations.migratedTarget.stateDigest ||
            observations.replay.ledgerRowsBefore !== sourceLedgerRows ||
            observations.replay.ledgerRowsAfterFirstRun !== observations.ledger.rows.length ||
            observations.replay.ledgerRowsAfterReplay !== observations.ledger.rows.length)
    ) {
        invalid(
            "migrationJobResult.observations.replay",
            "must replay the exact passed migrated target and complete ledger",
        );
    }
    for (const resumption of observations.resumptions.filter((entry) => observedOutcome(entry.status))) {
        const failure = observations.failureInjections.find((entry) => entry.boundary === resumption.boundary);
        if (!failure || !observedOutcome(failure.status) || !failure.injected) {
            invalid(
                "migrationJobResult.observations.resumptions",
                `boundary ${resumption.boundary} must reference an observed injected failure`,
            );
        }
    }
    const cmsCutover = observations.cutover.cmsMediated;
    const activation = observations.cutover.activation;
    if (
        cmsCutover.status === "passed" &&
        activation.status === "passed" &&
        (activation.activeBindingDigest !== cmsCutover.bindingRevisionAfter ||
            (observations.migratedTarget.bindingDigest !== undefined &&
                observations.migratedTarget.bindingDigest !== activation.activeBindingDigest))
    ) {
        invalid(
            "migrationJobResult.observations.cutover.activation",
            "must activate the exact observed CMS binding revision",
        );
    }
}

function observedOutcome(status: string): boolean {
    return status === "passed" || status === "failed";
}

function assertLedger(
    ledger: MigrationJobResultV1["observations"]["ledger"],
    input: MigrationVerificationInputV1,
    attempt: MigrationJobAttemptIdentityV1,
): void {
    if (
        (ledger.sourceRevision !== undefined && ledger.sourceRevision !== input.sourceMigrationRevision) ||
        (ledger.targetRevision !== undefined && ledger.targetRevision !== input.targetMigrationRevision)
    ) {
        invalid("migrationJobResult.observations.ledger", "records substituted source or target revisions");
    }
    const expected = input.migrationPlan.plan.install.coveredMigrations;
    if ((ledger.status === "passed" || ledger.status === "failed") && ledger.rows.length !== expected.length) {
        invalid("migrationJobResult.observations.ledger.rows", "must observe every target migration ledger row");
    }
    for (const [index, row] of ledger.rows.entries()) {
        const reference = expected[index];
        const newlyApplied = row.revision > input.sourceMigrationRevision;
        if (
            !reference ||
            row.migrationId !== reference.id ||
            row.checksum !== reference.checksum ||
            row.revision !== reference.revision ||
            (newlyApplied &&
                (row.attemptId !== attempt.attemptId ||
                    row.sourcePackageDigest !== input.source.packageDigest ||
                    row.targetPackageDigest !== input.target.packageDigest))
        ) {
            invalid("migrationJobResult.observations.ledger.rows", "does not match the exact planned ledger");
        }
    }
}

function assertCutover(
    cutover: MigrationJobResultV1["observations"]["cutover"],
    input: MigrationVerificationInputV1,
): void {
    const expectedCms = input.migrationPlan.plan.cmsMediated?.strategy ?? "not-applicable";
    const expectedProvider = input.migrationPlan.plan.providerDirect?.strategy ?? "not-applicable";
    if (cutover.cmsMediated.strategy !== expectedCms || cutover.providerDirect.strategy !== expectedProvider) {
        invalid("migrationJobResult.observations.cutover", "does not observe the exact planned cutover strategies");
    }
    const expectedCallbacks = input.migrationPlan.plan.providerDirect?.callbackIds ?? [];
    if (
        cutover.providerDirect.callbackIds.length !== expectedCallbacks.length ||
        cutover.providerDirect.callbackIds.some((entry, index) => entry !== expectedCallbacks[index])
    ) {
        invalid("migrationJobResult.observations.cutover.providerDirect.callbackIds", "substitutes planned callbacks");
    }
    if (
        cutover.activation.activePackageDigest &&
        cutover.activation.activePackageDigest !== input.target.packageDigest
    ) {
        invalid("migrationJobResult.observations.cutover.activation", "activates a substituted package digest");
    }
}
