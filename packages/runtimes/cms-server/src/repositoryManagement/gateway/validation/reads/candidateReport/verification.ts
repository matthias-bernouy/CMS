import {
    array,
    assertEqual,
    boolean,
    canonicalText,
    digest,
    enumValue,
    exactObject,
    nonNegativeInteger,
    positiveInteger,
} from "../../helpers";
import type { CandidateReportIdentity } from "./shared";
import { identifier, prefixedDigest } from "./shared";

const SOURCES = ["platform", "author-contract", "author-conformance"] as const;
const SUITE_OUTCOMES = ["passed", "failed", "skipped", "not-applicable", "infrastructure-failure"] as const;
const REPORT_OUTCOMES = ["passed", "failed", "infrastructure-failure"] as const;

export function validateCandidateVerification(value: unknown, identity: CandidateReportIdentity): void {
    const verification = exactObject(value, ["state", "bindings", "runner", "suites"], ["environment", "outcome"]);
    const state = enumValue(verification.state, ["planned", "completed"] as const);
    validateBindings(verification.bindings, identity);
    validateRunner(verification.runner);
    const suites = array(verification.suites).map((suite) => validateSuite(suite, state));
    uniqueSuiteIds(suites);
    if (state === "planned") {
        assertEqual(verification.environment, undefined);
        assertEqual(verification.outcome, undefined);
        return;
    }
    validateEnvironment(verification.environment);
    const outcome = enumValue(verification.outcome, REPORT_OUTCOMES);
    assertEqual(outcome, expectedOutcome(suites));
}

function validateBindings(value: unknown, identity: CandidateReportIdentity): void {
    const bindings = exactObject(
        value,
        ["candidateId", "candidateDigest", "packageDigest", "verificationDigest", "policyDigest"],
        ["behavioralRlsPlanDigest"],
    );
    assertEqual(identifier(bindings.candidateId), identity.candidateId);
    assertEqual(digest(bindings.candidateDigest), identity.candidateDigest);
    assertEqual(digest(bindings.packageDigest), identity.packageDigest);
    assertEqual(digest(bindings.verificationDigest), identity.verificationDigest);
    digest(bindings.policyDigest);
    if (bindings.behavioralRlsPlanDigest !== undefined) {
        digest(bindings.behavioralRlsPlanDigest);
    }
}

function validateRunner(value: unknown): void {
    const runner = exactObject(value, ["name", "version", "imageDigest"]);
    identifier(runner.name);
    canonicalText(runner.version, 128);
    prefixedDigest(runner.imageDigest);
}

function validateEnvironment(value: unknown): void {
    const environment = exactObject(value, ["digest", "versions"]);
    digest(environment.digest);
    const names = array(environment.versions, 64).map((entry) => {
        const version = exactObject(entry, ["name", "version"]);
        canonicalText(version.version, 128);
        return identifier(version.name);
    });
    if (names.length === 0 || new Set(names).size !== names.length) {
        throw new TypeError("Repository candidate environment versions are invalid");
    }
}

function validateSuite(value: unknown, state: "planned" | "completed") {
    const executionFields = ["outcome", "durationMs", "attempts", "cacheHit", "diagnostics"] as const;
    const suite = exactObject(
        value,
        ["suiteId", "source", "contentDigest", ...(state === "completed" ? executionFields : [])],
        ["applicable"],
    );
    const result = {
        suiteId: identifier(suite.suiteId),
        outcome: state === "completed" ? enumValue(suite.outcome, SUITE_OUTCOMES) : undefined,
    };
    enumValue(suite.source, SOURCES);
    digest(suite.contentDigest);
    if (suite.applicable !== undefined) {
        boolean(suite.applicable);
    }
    if (state === "completed") {
        nonNegativeInteger(suite.durationMs);
        positiveInteger(suite.attempts);
        boolean(suite.cacheHit);
        array(suite.diagnostics, 8).forEach((diagnostic) => {
            const projected = exactObject(diagnostic, ["code", "redacted"]);
            identifier(projected.code);
            assertEqual(projected.redacted, true);
        });
    }
    return result;
}

function uniqueSuiteIds(suites: readonly Readonly<{ suiteId: string }>[]): void {
    if (suites.length === 0 || new Set(suites.map(({ suiteId }) => suiteId)).size !== suites.length) {
        throw new TypeError("Repository candidate suites are invalid");
    }
}

function expectedOutcome(suites: readonly Readonly<{ outcome?: string }>[]) {
    return suites.some(({ outcome }) => outcome === "infrastructure-failure")
        ? "infrastructure-failure"
        : suites.some(({ outcome }) => outcome === "failed" || outcome === "skipped")
          ? "failed"
          : "passed";
}
