import {
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    parseStrictJsonDocument,
} from "@bernouy/cms-integration-packages";
import {
    computeIntegrationVerificationDigest,
    identifyMigrationVerificationInput,
    validateAdmissionInputSnapshotForPolicy,
    validateIntegrationVerificationEnvelope,
    validateReleaseAdmissionPolicySnapshot,
} from "@bernouy/cms-integration-verification";
import { validateIntegrationPackageEnvelope } from "@bernouy/cms-integration-packages";
import type { VerificationSandboxInput } from "../supervisor";
import { parseExactMigrationPackages } from "../protocol/workload";
import { validateDisposableDatabaseCredential } from "../supervisor/execution/credential";

const IDENTIFIER = /^[A-Za-z0-9][A-Za-z0-9._-]{0,127}$/u;

export async function parseCanonicalVerificationSandboxInput(
    bytes: Uint8Array,
    maxBytes: number,
): Promise<VerificationSandboxInput> {
    if (bytes.byteLength > maxBytes) {
        throw new TypeError("Sandbox input exceeds its byte limit");
    }
    const document = parseStrictJsonDocument(bytes, maxBytes);
    const root = strictRecord(document, ["workload", "database"]);
    const rawWorkload = root.workload;
    const hasMigrationInputs = Boolean(
        rawWorkload &&
            typeof rawWorkload === "object" &&
            !Array.isArray(rawWorkload) &&
            "migrationInputs" in rawWorkload,
    );
    const hasMigrationPackages = Boolean(
        rawWorkload &&
            typeof rawWorkload === "object" &&
            !Array.isArray(rawWorkload) &&
            "migrationPackages" in rawWorkload,
    );
    const workload = strictRecord(rawWorkload, [
        "package",
        "verification",
        "policy",
        "admission",
        ...(hasMigrationInputs ? ["migrationInputs"] : []),
        ...(hasMigrationPackages ? ["migrationPackages"] : []),
        "attempt",
    ]);
    const packageEnvelope = validateIntegrationPackageEnvelope(workload.package, { requireReleaseNotes: true });
    const verification = validateIntegrationVerificationEnvelope(workload.verification);
    const policy = await validateReleaseAdmissionPolicySnapshot(workload.policy);
    const admission = await validateAdmissionInputSnapshotForPolicy(workload.admission, policy);
    const attempt = parseAttempt(workload.attempt);
    const rawMigrationInputs = workload.migrationInputs ?? [];
    if (!Array.isArray(rawMigrationInputs)) {
        throw new TypeError("Sandbox migration input plan must be an array");
    }
    const migrationInputs = (await Promise.all(rawMigrationInputs.map(identifyMigrationVerificationInput))).map(
        (entry) => entry.input,
    );
    const database = validateDisposableDatabaseCredential(root.database as VerificationSandboxInput["database"]);
    const packageDigest = await computeIntegrationPackageDigest(packageEnvelope);
    const migrationPackages = await parseExactMigrationPackages(workload.migrationPackages ?? [], migrationInputs, {
        kind: packageEnvelope.kind,
        version: packageEnvelope.version,
        packageDigest,
    });
    const verificationDigest = await computeIntegrationVerificationDigest(verification);
    if (
        packageEnvelope.kind !== admission.snapshot.candidate.kind ||
        packageEnvelope.version !== admission.snapshot.candidate.version ||
        packageDigest !== admission.snapshot.candidate.packageDigest ||
        verificationDigest !== admission.snapshot.candidate.verificationDigest ||
        verification.target.kind !== packageEnvelope.kind ||
        verification.target.version !== packageEnvelope.version ||
        verification.target.packageDigest !== packageDigest
    ) {
        throw new TypeError("Sandbox workload identities do not match");
    }
    const result: VerificationSandboxInput = {
        workload: {
            package: packageEnvelope,
            verification,
            policy,
            admission: admission.snapshot,
            migrationInputs,
            migrationPackages,
            attempt,
        },
        database,
    };
    if (!sameBytes(bytes, canonicalJsonBytes(result))) {
        throw new TypeError("Sandbox input must be canonical JSON");
    }
    return result;
}

function parseAttempt(value: unknown): VerificationSandboxInput["workload"]["attempt"] {
    const input = strictRecord(value, ["jobId", "attemptId", "fencingToken"]);
    if (
        typeof input.jobId !== "string" ||
        !IDENTIFIER.test(input.jobId) ||
        typeof input.attemptId !== "string" ||
        !IDENTIFIER.test(input.attemptId) ||
        !Number.isSafeInteger(input.fencingToken) ||
        (input.fencingToken as number) < 1
    ) {
        throw new TypeError("Sandbox attempt identity is invalid");
    }
    return {
        jobId: input.jobId,
        attemptId: input.attemptId,
        fencingToken: input.fencingToken as number,
    };
}

function strictRecord(value: unknown, fields: readonly string[]): Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new TypeError("Sandbox protocol object is invalid");
    }
    const input = value as Record<string, unknown>;
    const keys = Object.keys(input);
    if (keys.length !== fields.length || !fields.every((field) => keys.includes(field))) {
        throw new TypeError("Sandbox protocol object fields are invalid");
    }
    return input;
}

function sameBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
