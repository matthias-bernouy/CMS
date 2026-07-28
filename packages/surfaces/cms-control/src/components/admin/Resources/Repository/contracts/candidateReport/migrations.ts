import { optionalProperty, readArray, readRecord, readText } from "../parsing";
import { optionalBoolean, optionalCount, optionalText, parseObservation, parseVersionReference } from "./shared";
import type {
    RepositoryCandidateMigrationView,
    RepositoryCandidateObservationView,
    RepositoryCandidateTargetObservationView,
} from "./types";

export function parseMigrations(value: unknown): readonly RepositoryCandidateMigrationView[] {
    return readArray(value, 256).map((entry) => {
        const source = readRecord(entry);
        return {
            migrationInputDigest: readText(source.migrationInputDigest),
            source: parseVersionReference(source.source),
            target: parseVersionReference(source.target),
            connectorKey: readText(source.connectorKey),
            lineageId: readText(source.lineageId),
            sourceMigrationRevision: requiredCount(source.sourceMigrationRevision),
            targetMigrationRevision: requiredCount(source.targetMigrationRevision),
            supportedSourceRange: readText(source.supportedSourceRange),
            ...optionalProperty(
                "result",
                source.result === undefined ? undefined : parseMigrationResult(source.result),
            ),
        };
    });
}

function parseMigrationResult(value: unknown): NonNullable<RepositoryCandidateMigrationView["result"]> {
    const source = readRecord(value);
    return {
        runnerDigest: readText(source.runnerDigest),
        environmentDigest: readText(source.environmentDigest),
        freshTarget: parseTargetObservation(source.freshTarget),
        migratedTarget: parseTargetObservation(source.migratedTarget),
        equivalence: parseEquivalence(source.equivalence),
        ledger: parseLedger(source.ledger),
        replay: parseReplay(source.replay),
        cutover: parseCutover(source.cutover),
    };
}

function parseTargetObservation(value: unknown): RepositoryCandidateTargetObservationView {
    const source = readRecord(value);
    return {
        ...parseObservation(source),
        ...optionalText("stateDigest", source.stateDigest),
        ...optionalText("schemaDigest", source.schemaDigest),
        ...optionalText("dataDigest", source.dataDigest),
        ...optionalText("bindingDigest", source.bindingDigest),
        functionDigests: readArray(source.functionDigests).map((entry) => {
            const functionDigest = readRecord(entry);
            return { functionId: readText(functionDigest.functionId), digest: readText(functionDigest.digest) };
        }),
    };
}

function parseEquivalence(value: unknown) {
    const source = readRecord(value);
    return {
        ...parseObservation(source),
        ...optionalProperty("equivalent", optionalBoolean(source.equivalent)),
        differenceCount: readArray(source.differences).length,
    };
}

function parseLedger(value: unknown) {
    const source = readRecord(value);
    return {
        ...parseObservation(source),
        ...optionalProperty("sourceRevision", optionalCount(source.sourceRevision)),
        ...optionalProperty("targetRevision", optionalCount(source.targetRevision)),
        ...optionalProperty("freshBaselineRecorded", optionalBoolean(source.freshBaselineRecorded)),
        ...optionalProperty("migrationAndLedgerAtomic", optionalBoolean(source.migrationAndLedgerAtomic)),
        ...optionalProperty("checksumMismatchRejected", optionalBoolean(source.checksumMismatchRejected)),
        ...optionalProperty("emptyLedgerRejected", optionalBoolean(source.emptyLedgerRejected)),
        migrationIds: readArray(source.rows).map((entry) => readText(readRecord(entry).migrationId)),
    };
}

function parseReplay(value: unknown) {
    const source = readRecord(value);
    return {
        ...parseObservation(source),
        ...optionalProperty("unchanged", optionalBoolean(source.unchanged)),
        ...optionalProperty("ledgerRowsBefore", optionalCount(source.ledgerRowsBefore)),
        ...optionalProperty("ledgerRowsAfterFirstRun", optionalCount(source.ledgerRowsAfterFirstRun)),
        ...optionalProperty("ledgerRowsAfterReplay", optionalCount(source.ledgerRowsAfterReplay)),
    };
}

function parseCutover(value: unknown) {
    const source = readRecord(value);
    return {
        cmsMediated: cutoverObservation(source.cmsMediated, ["bindingRevisionBefore", "bindingRevisionAfter"]),
        providerDirect: providerCutover(source.providerDirect),
        activation: activationCutover(source.activation),
    };
}

function cutoverObservation(value: unknown, fields: readonly string[]) {
    const source = readRecord(value);
    return {
        ...parseObservation(source),
        strategy: readText(source.strategy),
        ...optionalText(fields[0]!, source[fields[0]!]),
        ...optionalText(fields[1]!, source[fields[1]!]),
    };
}

function providerCutover(value: unknown) {
    const source = readRecord(value);
    return {
        ...parseObservation(source),
        strategy: readText(source.strategy),
        callbackIds: readArray(source.callbackIds).map(readText),
        ...optionalProperty("signingSecretContinuityObserved", optionalBoolean(source.signingSecretContinuityObserved)),
    };
}

function activationCutover(value: unknown): RepositoryCandidateObservationView & {
    pointOfNoReturnCrossed?: boolean;
    cleanupObserved?: boolean;
} {
    const source = readRecord(value);
    return {
        ...parseObservation(source),
        ...optionalProperty("pointOfNoReturnCrossed", optionalBoolean(source.pointOfNoReturnCrossed)),
        ...optionalProperty("cleanupObserved", optionalBoolean(source.cleanupObserved)),
    };
}

function requiredCount(value: unknown): number {
    const result = optionalCount(value);
    if (result === undefined) {
        throw new TypeError("Repository candidate migration revision is missing");
    }
    return result;
}
