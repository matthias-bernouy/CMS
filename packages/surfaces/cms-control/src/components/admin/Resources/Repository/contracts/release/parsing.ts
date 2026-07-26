import { readArray, readBoolean, readCount, readOptionalText, readRecord, readText } from "../parsing";
import type { RepositoryReleaseMigrationView, RepositoryReleaseVerificationView, RepositoryReleaseView } from "./types";

export function parseRepositoryRelease(value: unknown): RepositoryReleaseView {
    const source = readRecord(value);
    return {
        kind: readText(source.kind),
        version: readText(source.version),
        packageDigest: readText(source.packageDigest),
        ...(readOptionalText(source.verificationDigest)
            ? { verificationDigest: readText(source.verificationDigest) }
            : {}),
        status: readText(source.status),
        installable: readBoolean(source.installable),
        freshInstallOnly: readBoolean(source.freshInstallOnly),
        ...(source.compatibility === undefined ? {} : { compatibility: compatibility(source.compatibility) }),
        ...(source.verification === undefined ? {} : { verification: verification(source.verification) }),
        migrations: readArray(source.migrations, 256).map(migration),
        ...(source.decision === undefined ? {} : { decision: decision(source.decision) }),
    };
}

function compatibility(value: unknown): NonNullable<RepositoryReleaseView["compatibility"]> {
    const source = readRecord(value);
    return {
        reportId: readText(source.reportId),
        reportDigest: readText(source.reportDigest),
        origin: readText(source.origin),
        outcome: readText(source.outcome),
        contractAdmissible: readBoolean(source.contractAdmissible),
        releaseLevel: readText(source.releaseLevel),
        requiredReleaseLevel: readText(source.requiredReleaseLevel),
        findings: readArray(source.findings).map((value) => {
            const finding = readRecord(value);
            return {
                findingId: readText(finding.findingId),
                classification: readText(finding.classification),
                surface: readText(finding.surface),
                path: readText(finding.path),
                code: readText(finding.code),
                message: readText(finding.message),
            };
        }),
    };
}

function verification(value: unknown): RepositoryReleaseVerificationView {
    const source = readRecord(value);
    const runner = readRecord(source.runner);
    const environment = readRecord(source.environment);
    return {
        reportId: readText(source.reportId),
        reportDigest: readText(source.reportDigest),
        origin: readText(source.origin),
        outcome: readText(source.outcome),
        runner: {
            name: readText(runner.name),
            version: readText(runner.version),
            imageDigest: readText(runner.imageDigest),
        },
        environment: { digest: readText(environment.digest), versions: textRecord(environment.versions) },
        results: readArray(source.results).map((value) => {
            const result = readRecord(value);
            return {
                suiteId: readText(result.suiteId),
                source: readText(result.source),
                required: readBoolean(result.required),
                outcome: readText(result.outcome),
                attempts: readCount(result.attempts),
                cacheHit: readBoolean(result.cacheHit),
                diagnostics: readArray(result.diagnostics).map((value) => {
                    const diagnostic = readRecord(value);
                    return { code: readText(diagnostic.code), message: readText(diagnostic.message) };
                }),
            };
        }),
    };
}

function migration(value: unknown): RepositoryReleaseMigrationView {
    const source = readRecord(value);
    const identity = readRecord(source.source);
    const cutover = readRecord(source.cutover);
    return {
        reportId: readText(source.reportId),
        reportDigest: readText(source.reportDigest),
        origin: readText(source.origin),
        source: {
            kind: readText(identity.kind),
            version: readText(identity.version),
            packageDigest: readText(identity.packageDigest),
        },
        supportedSourceRange: readText(source.supportedSourceRange),
        connectorKey: readText(source.connectorKey),
        lineageId: readText(source.lineageId),
        migrationRevision: readCount(source.migrationRevision),
        outcome: readText(source.outcome),
        cutover: {
            cmsMediated: readText(cutover.cmsMediated),
            providerDirect: readText(cutover.providerDirect),
        },
        rollback: readText(source.rollback),
        pointOfNoReturn: readText(source.pointOfNoReturn),
        delayedCleanupVerified: readBoolean(source.delayedCleanupVerified),
    };
}

function decision(value: unknown): NonNullable<RepositoryReleaseView["decision"]> {
    const source = readRecord(value);
    return {
        decisionId: readText(source.decisionId),
        decisionDigest: readText(source.decisionDigest),
        admissible: readBoolean(source.admissible),
        reasons: readArray(source.reasons, 256).map(readText),
        createdAt: readText(source.createdAt),
    };
}

function textRecord(value: unknown): Readonly<Record<string, string>> {
    const source = readRecord(value);
    return Object.fromEntries(
        Object.entries(source)
            .slice(0, 64)
            .map(([key, entry]) => [key, readText(entry)]),
    );
}
