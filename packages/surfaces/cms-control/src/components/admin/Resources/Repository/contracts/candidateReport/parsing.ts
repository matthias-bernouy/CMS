import { parseRepositoryCandidate } from "../candidates";
import { optionalProperty, readArray, readBoolean, readCount, readRecord, readText } from "../parsing";
import { parseMigrations } from "./migrations";
import { parseVersionReference } from "./shared";
import type {
    RepositoryCandidateCompatibilityView,
    RepositoryCandidateReportView,
    RepositoryCandidateVerificationView,
} from "./types";

export function parseRepositoryCandidateReport(value: unknown): RepositoryCandidateReportView {
    const report = readRecord(readRecord(value).report);
    if (readText(report.schema) !== "cms.repository.management.candidate-report.v1") {
        throw new TypeError("Repository candidate report schema is unsupported");
    }
    return {
        candidate: parseRepositoryCandidate(report.candidate),
        ...optionalProperty(
            "compatibility",
            report.compatibility === undefined ? undefined : parseCompatibility(report.compatibility),
        ),
        ...optionalProperty(
            "verification",
            report.verification === undefined ? undefined : parseVerification(report.verification),
        ),
        migrations: parseMigrations(report.migrations),
    };
}

function parseCompatibility(value: unknown): RepositoryCandidateCompatibilityView {
    const source = readRecord(value);
    return {
        outcome: readText(source.outcome),
        contractAdmissible: readBoolean(source.contractAdmissible),
        releaseLevel: readText(source.releaseLevel),
        requiredReleaseLevel: readText(source.requiredReleaseLevel),
        baselines: readArray(source.baselines).map(parseVersionReference),
        informationalBaselines: readArray(source.informationalBaselines).map(parseVersionReference),
        findings: readArray(source.findings).map((entry) => {
            const finding = readRecord(entry);
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

function parseVerification(value: unknown): RepositoryCandidateVerificationView {
    const source = readRecord(value);
    const runner = readRecord(source.runner);
    return {
        state: readText(source.state),
        runner: {
            name: readText(runner.name),
            version: readText(runner.version),
            imageDigest: readText(runner.imageDigest),
        },
        ...optionalProperty(
            "environment",
            source.environment === undefined ? undefined : parseEnvironment(source.environment),
        ),
        ...optionalProperty("outcome", source.outcome === undefined ? undefined : readText(source.outcome)),
        suites: readArray(source.suites).map(parseSuite),
    };
}

function parseEnvironment(value: unknown) {
    const source = readRecord(value);
    return {
        digest: readText(source.digest),
        versions: readArray(source.versions).map((entry) => {
            const version = readRecord(entry);
            return { name: readText(version.name), version: readText(version.version) };
        }),
    };
}

function parseSuite(value: unknown) {
    const source = readRecord(value);
    return {
        suiteId: readText(source.suiteId),
        source: readText(source.source),
        ...optionalProperty("applicable", source.applicable === undefined ? undefined : readBoolean(source.applicable)),
        ...optionalProperty("outcome", source.outcome === undefined ? undefined : readText(source.outcome)),
        ...optionalProperty("durationMs", source.durationMs === undefined ? undefined : readCount(source.durationMs)),
        ...optionalProperty("attempts", source.attempts === undefined ? undefined : readCount(source.attempts)),
        ...optionalProperty("cacheHit", source.cacheHit === undefined ? undefined : readBoolean(source.cacheHit)),
        diagnosticCodes:
            source.diagnostics === undefined
                ? []
                : readArray(source.diagnostics).map((entry) => readText(readRecord(entry).code)),
    };
}
