import { assertIntegrationPackageKind, assertIntegrationPackageVersion } from "@bernouy/cms-integration-packages";
import { parseVerificationPolicyIdentity } from "@bernouy/cms-integration-verification";
import type { OfficialVerificationBackfillIndexEntry, OfficialVerificationBackfillIndexV1 } from "./contracts";
import { OFFICIAL_INTEGRATION_VERIFICATION_POLICY, OFFICIAL_VERIFICATION_BACKFILL_SCHEMA } from "./contracts";

const SHA256_PATTERN = /^[a-f0-9]{64}$/u;
const MAX_BACKFILL_ENTRIES = 256;

export function parseOfficialVerificationBackfillIndex(value: unknown): OfficialVerificationBackfillIndexV1 {
    if (!hasExactKeys(value, ["entries", "schema", "verificationPolicy"])) {
        throw new Error("Official verification backfill index has an invalid closed schema");
    }
    if (value.schema !== OFFICIAL_VERIFICATION_BACKFILL_SCHEMA) {
        throw new Error("Official verification backfill index has an invalid schema identity");
    }
    const verificationPolicy = parseVerificationPolicyIdentity(value.verificationPolicy, "verificationPolicy");
    if (
        verificationPolicy.name !== OFFICIAL_INTEGRATION_VERIFICATION_POLICY.name ||
        verificationPolicy.version !== OFFICIAL_INTEGRATION_VERIFICATION_POLICY.version
    ) {
        throw new Error("Official verification backfill index uses an unapproved verification policy");
    }
    if (!Array.isArray(value.entries) || value.entries.length < 1 || value.entries.length > MAX_BACKFILL_ENTRIES) {
        throw new Error("Official verification backfill index entries are outside their bounded inventory");
    }
    const entries = value.entries.map(parseEntry);
    let previous = "";
    const digests = new Set<string>();
    for (const entry of entries) {
        const identity = `${entry.kind}\0${entry.version}`;
        if ((previous && previous >= identity) || digests.has(entry.verificationDigest)) {
            throw new Error("Official verification backfill entries must be uniquely and deterministically ordered");
        }
        previous = identity;
        digests.add(entry.verificationDigest);
    }
    return {
        schema: OFFICIAL_VERIFICATION_BACKFILL_SCHEMA,
        verificationPolicy,
        entries,
    };
}

function parseEntry(value: unknown): OfficialVerificationBackfillIndexEntry {
    if (!hasExactKeys(value, ["kind", "packageDigest", "verificationDigest", "version"])) {
        throw new Error("Official verification backfill entry has an invalid closed schema");
    }
    if (
        typeof value.kind !== "string" ||
        typeof value.version !== "string" ||
        typeof value.packageDigest !== "string" ||
        typeof value.verificationDigest !== "string" ||
        !SHA256_PATTERN.test(value.packageDigest) ||
        !SHA256_PATTERN.test(value.verificationDigest)
    ) {
        throw new Error("Official verification backfill entry has invalid identity fields");
    }
    return {
        kind: assertIntegrationPackageKind(value.kind),
        version: assertIntegrationPackageVersion(value.version),
        packageDigest: value.packageDigest,
        verificationDigest: value.verificationDigest,
    };
}

function hasExactKeys(value: unknown, expected: readonly string[]): value is Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const keys = Object.keys(value);
    return keys.length === expected.length && expected.every((key) => keys.includes(key));
}
