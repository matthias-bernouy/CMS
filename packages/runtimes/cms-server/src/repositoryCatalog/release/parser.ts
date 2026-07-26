import type { PublicRepositoryRelease } from "@bernouy/cms-repository";
import { parsePublicMigration } from "./migration";
import {
    array,
    boolean,
    count,
    digest,
    digestIdentity,
    enumText,
    identity,
    invalid,
    policy,
    runner,
    strictRecord,
    text,
    textRecord,
} from "./values";

export function parsePublicRepositoryRelease(
    value: unknown,
    expected: Readonly<{ kind: string; version: string }>,
): PublicRepositoryRelease {
    const source = strictRecord(
        value,
        ["freshInstallOnly", "installable", "kind", "migrations", "packageDigest", "status", "version"],
        ["compatibility", "decision", "verification", "verificationDigest"],
    );
    const actual = identity(source.kind, source.version);
    if (actual.kind !== expected.kind || actual.version !== expected.version) {
        invalid();
    }
    const status = enumText(source.status, ["installable", "blocked", "inadmissible", "unverified"] as const);
    const installable = boolean(source.installable);
    if (installable !== (status === "installable")) {
        invalid();
    }
    return {
        ...actual,
        packageDigest: digest(source.packageDigest),
        status,
        installable,
        freshInstallOnly: boolean(source.freshInstallOnly),
        ...(source.verificationDigest === undefined ? {} : { verificationDigest: digest(source.verificationDigest) }),
        ...(source.compatibility === undefined ? {} : { compatibility: parseCompatibility(source.compatibility) }),
        ...(source.verification === undefined ? {} : { verification: parseVerification(source.verification) }),
        migrations: array(source.migrations, 256).map(parsePublicMigration),
        ...(source.decision === undefined ? {} : { decision: parseDecision(source.decision) }),
    };
}

function parseCompatibility(value: unknown): NonNullable<PublicRepositoryRelease["compatibility"]> {
    const source = strictRecord(value, [
        "baselines",
        "contractAdmissible",
        "evaluator",
        "findings",
        "origin",
        "outcome",
        "releaseLevel",
        "reportDigest",
        "reportId",
        "requiredReleaseLevel",
    ]);
    return {
        reportId: text(source.reportId, 256),
        reportDigest: digest(source.reportDigest),
        origin: enumText(source.origin, ["admission", "legacy-backfill"] as const),
        outcome: text(source.outcome, 1_024),
        contractAdmissible: boolean(source.contractAdmissible),
        releaseLevel: text(source.releaseLevel, 1_024),
        requiredReleaseLevel: text(source.requiredReleaseLevel, 1_024),
        evaluator: policy(source.evaluator),
        baselines: array(source.baselines, 256).map(digestIdentity),
        findings: array(source.findings, 4_096).map(parseFinding),
    };
}

function parseFinding(value: unknown): NonNullable<PublicRepositoryRelease["compatibility"]>["findings"][number] {
    const source = strictRecord(value, ["classification", "code", "findingId", "message", "path", "surface"]);
    return {
        findingId: text(source.findingId, 256),
        classification: text(source.classification, 1_024),
        surface: text(source.surface, 1_024),
        path: text(source.path, 16_384),
        code: text(source.code, 1_024),
        message: text(source.message, 16_384),
    };
}

function parseVerification(value: unknown): NonNullable<PublicRepositoryRelease["verification"]> {
    const source = strictRecord(value, [
        "environment",
        "origin",
        "outcome",
        "policy",
        "reportDigest",
        "reportId",
        "results",
        "runner",
    ]);
    const environment = strictRecord(source.environment, ["digest", "versions"]);
    return {
        reportId: text(source.reportId, 256),
        reportDigest: digest(source.reportDigest),
        origin: enumText(source.origin, ["admission", "legacy-backfill"] as const),
        outcome: text(source.outcome, 1_024),
        runner: runner(source.runner),
        environment: { digest: digest(environment.digest), versions: textRecord(environment.versions, 64) },
        policy: policy(source.policy, true) as NonNullable<PublicRepositoryRelease["verification"]>["policy"],
        results: array(source.results, 4_096).map(parseResult),
    };
}

function parseResult(value: unknown): NonNullable<PublicRepositoryRelease["verification"]>["results"][number] {
    const source = strictRecord(value, [
        "attempts",
        "cacheHit",
        "diagnostics",
        "outcome",
        "required",
        "source",
        "suiteId",
    ]);
    return {
        suiteId: text(source.suiteId, 256),
        source: text(source.source, 1_024),
        required: boolean(source.required),
        outcome: text(source.outcome, 1_024),
        attempts: count(source.attempts),
        cacheHit: boolean(source.cacheHit),
        diagnostics: array(source.diagnostics, 4_096).map((value) => {
            const diagnostic = strictRecord(value, ["code", "message"]);
            return { code: text(diagnostic.code, 1_024), message: text(diagnostic.message, 16_384) };
        }),
    };
}

function parseDecision(value: unknown): NonNullable<PublicRepositoryRelease["decision"]> {
    const source = strictRecord(value, [
        "admissible",
        "createdAt",
        "decisionDigest",
        "decisionId",
        "policy",
        "reasons",
    ]);
    return {
        decisionId: text(source.decisionId, 256),
        decisionDigest: digest(source.decisionDigest),
        admissible: boolean(source.admissible),
        reasons: array(source.reasons, 256).map((reason) => text(reason, 16_384)),
        createdAt: text(source.createdAt, 1_024),
        policy: policy(source.policy, true) as NonNullable<PublicRepositoryRelease["decision"]>["policy"],
    };
}
