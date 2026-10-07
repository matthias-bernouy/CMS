import type {
    ConformanceCallEvidence,
    ConformanceEvidence,
    ConformanceScenarioEvidence,
} from "cms-repository/contracts/interfaces/ConformanceEvidence";
import type { ReleaseDigest } from "cms-repository/contracts/core/admission/digest";
import { canonicalizeIJson } from "cms-repository/contracts/core/protocol/canonical";
import { parseStrictJson } from "cms-repository/contracts/core/protocol/json";
import { verifyEvidenceSuiteReference } from "./evidenceSuite";
import {
    dateTime,
    digest,
    duration,
    evidenceArray,
    exactRecord,
    fail,
    identifier,
    integer,
    runStatus,
    text,
} from "./evidenceValues";

export interface AdmittedConformanceEvidence {
    readonly kind: "admitted-conformance-evidence";
    readonly evidence: ConformanceEvidence;
    readonly canonicalJson: string;
    readonly digest: ReleaseDigest;
}

const VERSION = /^\d+\.\d+\.\d+(?:-[0-9A-Za-z.-]+)?(?:\+[0-9A-Za-z.-]+)?$/u;
const UUID = /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/u;

export async function admitConformanceEvidence(value: unknown): Promise<AdmittedConformanceEvidence> {
    const evidence = parseConformanceEvidence(value);
    await verifyEvidenceSuiteReference(evidence);
    const canonicalJson = canonicalizeIJson(evidence, 32);
    const hash = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(canonicalJson));
    return Object.freeze({
        kind: "admitted-conformance-evidence",
        evidence,
        canonicalJson,
        digest: `sha256:${Buffer.from(hash).toString("hex")}` as ReleaseDigest,
    });
}

export async function admitConformanceEvidenceJson(input: string | Uint8Array): Promise<AdmittedConformanceEvidence> {
    return admitConformanceEvidence(parseStrictJson(input, 8 * 1024 * 1024, 32));
}

export function parseConformanceEvidence(value: unknown): ConformanceEvidence {
    const record = exactRecord(value, [
        "kind",
        "protocol",
        "id",
        "publisherId",
        "providerId",
        "providerManifest",
        "providerBuildVersion",
        "contract",
        "suite",
        "runner",
        "startedAt",
        "finishedAt",
        "status",
        "scenarios",
    ]);
    if (record.kind !== "conformance-evidence" || record.protocol !== "ulvia-conformance-evidence/v1") {
        fail("Invalid conformance evidence kind or protocol");
    }
    const startedAt = dateTime(record.startedAt, "startedAt");
    const finishedAt = dateTime(record.finishedAt, "finishedAt");
    if (Date.parse(finishedAt) < Date.parse(startedAt)) {
        fail("Conformance evidence finishes before it starts");
    }
    const scenarios = evidenceArray(record.scenarios, 1, 256, parseScenario);
    const status = runStatus(record.status);
    if ((status === "passed") !== scenarios.every((item) => item.status === "passed")) {
        fail("Conformance evidence status does not match its scenarios");
    }
    return Object.freeze({
        kind: "conformance-evidence",
        protocol: "ulvia-conformance-evidence/v1",
        id: text(record.id, "id", UUID, 36),
        publisherId: identifier(record.publisherId, "publisherId"),
        providerId: identifier(record.providerId, "providerId"),
        providerManifest: versionDigest(record.providerManifest, "providerManifest"),
        providerBuildVersion: text(record.providerBuildVersion, "providerBuildVersion", VERSION, 64),
        contract: contractReference(record.contract),
        suite: suiteReference(record.suite),
        runner: runnerReference(record.runner),
        startedAt,
        finishedAt,
        status,
        scenarios,
    });
}

function parseScenario(value: unknown): ConformanceScenarioEvidence {
    const record = exactRecord(value, ["id", "profileId", "status", "durationMs", "calls"]);
    const calls = evidenceArray(record.calls, 1, 256, parseCall);
    const status = runStatus(record.status);
    if ((status === "passed") !== calls.every((item) => item.status === "passed")) {
        fail("Scenario evidence status does not match its calls");
    }
    return Object.freeze({
        id: identifier(record.id, "scenario.id"),
        ...(record.profileId === undefined ? {} : { profileId: identifier(record.profileId, "scenario.profileId") }),
        status,
        durationMs: duration(record.durationMs),
        calls,
    });
}

function parseCall(value: unknown): ConformanceCallEvidence {
    const record = exactRecord(value, ["id", "status", "attempts", "durationMs", "failureCode"]);
    const status = runStatus(record.status);
    const failureCode =
        record.failureCode === undefined
            ? undefined
            : text(record.failureCode, "failureCode", /^[A-Z][A-Z0-9_]*$/u, 64);
    if ((status === "failed") !== Boolean(failureCode)) {
        fail("Failed call evidence needs exactly one failure code");
    }
    return Object.freeze({
        id: identifier(record.id, "call.id"),
        status,
        attempts: integer(record.attempts, 1, 1_000, "attempts"),
        durationMs: duration(record.durationMs),
        ...(failureCode ? { failureCode } : {}),
    });
}

function contractReference(value: unknown): ConformanceEvidence["contract"] {
    const record = exactRecord(value, ["publisherId", "id", "version", "digest"]);
    return Object.freeze({
        publisherId: identifier(record.publisherId, "contract.publisherId"),
        id: identifier(record.id, "contract.id"),
        version: text(record.version, "contract.version", VERSION, 64),
        digest: digest(record.digest, "contract.digest"),
    });
}

function suiteReference(value: unknown): ConformanceEvidence["suite"] {
    const record = exactRecord(value, ["version", "digest", "canonicalJson"]);
    const canonicalJson = text(record.canonicalJson, "suite.canonicalJson", undefined, 4 * 1024 * 1024);
    return Object.freeze({
        version: text(record.version, "suite.version", VERSION, 64),
        digest: digest(record.digest, "suite.digest"),
        canonicalJson,
    });
}

function versionDigest(value: unknown, label: string): { version: string; digest: ReleaseDigest } {
    const record = exactRecord(value, ["version", "digest"]);
    return Object.freeze({
        version: text(record.version, `${label}.version`, VERSION, 64),
        digest: digest(record.digest, `${label}.digest`),
    });
}

function runnerReference(value: unknown): ConformanceEvidence["runner"] {
    const record = exactRecord(value, ["name", "version"]);
    return Object.freeze({
        name: identifier(record.name, "runner.name"),
        version: text(record.version, "runner.version", VERSION, 64),
    });
}
