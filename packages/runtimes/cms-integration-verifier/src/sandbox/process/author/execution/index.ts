import { canonicalJsonBytes, sha256Hex } from "@bernouy/cms-integration-packages";
import type { BoundIntegrationVerificationAuthorSuiteV1 } from "@bernouy/cms-integration-verification";
import type { VerificationQuery } from "@bernouy/cms-integration-verification/sdk/v1";
import { AuthorSuiteBuildError, buildAuthorSuiteIife } from "../bundle";
import {
    AUTHOR_SUITE_LIMITS,
    type AuthorSuiteCanonicalEvidence,
    type AuthorSuiteChildConfig,
    type AuthorSuiteChildResult,
} from "../protocol";
import { AuthorSuiteProcessError, executeAuthorSuiteChild } from "./process";

export type AuthorSuiteExecution = Readonly<{
    suiteId: string;
    suiteDigest: string;
    outcome: "passed" | "failed" | "infrastructure-failure";
    durationMs: number;
    evidenceDigest?: string;
    diagnosticCode?: AuthorSuiteExecutionDiagnosticCode;
}>;

export type AuthorSuiteExecutionDiagnosticCode =
    | "author-suite-build-failed"
    | "author-suite-failed"
    | "author-suite-input-limit"
    | "author-suite-output-limit"
    | "author-suite-process-failed"
    | "author-suite-timeout";

export type AuthorSuiteExecutorConfig = Readonly<{
    tempRoot: string;
    timeoutMs?: number;
    maxOutputBytes?: number;
}>;

export interface AuthorSuiteExecutor {
    execute(
        suite: BoundIntegrationVerificationAuthorSuiteV1,
        query: VerificationQuery,
        signal: AbortSignal,
    ): Promise<AuthorSuiteExecution>;
}

export function createAuthorSuiteExecutor(config: AuthorSuiteExecutorConfig): AuthorSuiteExecutor {
    const limits = validatedConfig(config);
    const executor: AuthorSuiteExecutor = {
        async execute(
            suite: BoundIntegrationVerificationAuthorSuiteV1,
            query: VerificationQuery,
            signal: AbortSignal,
        ): Promise<AuthorSuiteExecution> {
            const started = performance.now();
            let bundleSource: string;
            try {
                bundleSource = await buildAuthorSuiteIife(suite, limits.tempRoot);
            } catch (error) {
                if (!(error instanceof AuthorSuiteBuildError)) {
                    throw error;
                }
                return await failedBuild(suite, elapsed(started));
            }
            try {
                const result = await executeAuthorSuiteChild(childConfig(suite, bundleSource), query, signal, limits);
                return await completedExecution(suite, result, elapsed(started));
            } catch (error) {
                if (signal.aborted) {
                    throw signal.reason;
                }
                return {
                    suiteId: suite.suiteId,
                    suiteDigest: suite.contentDigest,
                    outcome: "infrastructure-failure",
                    durationMs: elapsed(started),
                    diagnosticCode: infrastructureCode(error),
                };
            }
        },
    };
    return Object.freeze(executor);
}

async function completedExecution(
    suite: BoundIntegrationVerificationAuthorSuiteV1,
    result: AuthorSuiteChildResult,
    durationMs: number,
): Promise<AuthorSuiteExecution> {
    const outcome =
        result.tests.length > 0 && result.tests.every((test) => test.outcome === "passed") ? "passed" : "failed";
    const evidence: AuthorSuiteCanonicalEvidence = {
        schema: "cms.integration.author-suite-evidence.v1",
        suiteId: suite.suiteId,
        suiteDigest: suite.contentDigest,
        outcome,
        tests: result.tests.map(({ durationMs: _durationMs, ...test }) => test),
    };
    return {
        suiteId: suite.suiteId,
        suiteDigest: suite.contentDigest,
        outcome,
        durationMs,
        evidenceDigest: await sha256Hex(canonicalJsonBytes(evidence)),
        ...(outcome === "failed" ? { diagnosticCode: "author-suite-failed" as const } : {}),
    };
}

async function failedBuild(
    suite: BoundIntegrationVerificationAuthorSuiteV1,
    durationMs: number,
): Promise<AuthorSuiteExecution> {
    const evidence: AuthorSuiteCanonicalEvidence = {
        schema: "cms.integration.author-suite-evidence.v1",
        suiteId: suite.suiteId,
        suiteDigest: suite.contentDigest,
        outcome: "failed",
        tests: [{ name: "suite-definition", outcome: "failed", code: "invalid-suite-export" }],
    };
    return {
        suiteId: suite.suiteId,
        suiteDigest: suite.contentDigest,
        outcome: "failed",
        durationMs,
        evidenceDigest: await sha256Hex(canonicalJsonBytes(evidence)),
        diagnosticCode: "author-suite-build-failed",
    };
}

function childConfig(suite: BoundIntegrationVerificationAuthorSuiteV1, bundleSource: string): AuthorSuiteChildConfig {
    return {
        schema: "cms.integration.author-suite-child-input.v1",
        bundleSource,
        fixtures: Object.fromEntries(
            suite.content.fixtures.map(({ path, file }) => {
                return [path, { encoding: file.encoding, content: file.content }];
            }),
        ),
    };
}

function infrastructureCode(error: unknown): AuthorSuiteExecutionDiagnosticCode {
    if ((error as { code?: unknown })?.code === "error-output-limit") {
        return "author-suite-output-limit";
    }
    if (error instanceof TypeError && /protocol.*(?:byte limit|too large)/iu.test(error.message)) {
        return "author-suite-output-limit";
    }
    const code = error instanceof AuthorSuiteProcessError ? error.code : "process-failed";
    if (code === "timeout") {
        return "author-suite-timeout";
    }
    if (code === "input-limit") {
        return "author-suite-input-limit";
    }
    if (code === "output-limit") {
        return "author-suite-output-limit";
    }
    return "author-suite-process-failed";
}

function validatedConfig(config: AuthorSuiteExecutorConfig) {
    if (!config.tempRoot.startsWith("/")) {
        throw new TypeError("Author suite temp root must be absolute");
    }
    const timeoutMs = config.timeoutMs ?? AUTHOR_SUITE_LIMITS.timeoutMs;
    const maxOutputBytes = config.maxOutputBytes ?? AUTHOR_SUITE_LIMITS.maxOutputBytes;
    if (!Number.isSafeInteger(timeoutMs) || timeoutMs < 100 || timeoutMs > 60_000) {
        throw new TypeError("Author suite timeout is invalid");
    }
    if (!Number.isSafeInteger(maxOutputBytes) || maxOutputBytes < 1_024 || maxOutputBytes > 16 * 1_048_576) {
        throw new TypeError("Author suite output limit is invalid");
    }
    return { tempRoot: config.tempRoot, timeoutMs, maxOutputBytes };
}

function elapsed(started: number): number {
    return Math.max(0, Math.round(performance.now() - started));
}
