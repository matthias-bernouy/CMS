import {
    canonicalJsonBytes,
    DEFAULT_INTEGRATION_PACKAGE_LIMITS,
    parseStrictJsonDocument,
} from "@bernouy/cms-integration-packages";
import { identifyReviewedSchemaBaseline, parseReviewedSchemaBaseline } from "@bernouy/cms-integration-verification";
import { projectObservedSchemaContract } from "@bernouy/cms-integrations";
import { lstat, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import type { LocalReviewedSchemaEvidence } from "../types";

const MAX_EVIDENCE_BYTES = 16 * 1_024 * 1_024;
const EVIDENCE_PATH = join(".registry", "official-bootstrap-evidence.v1.json");

export async function loadReviewedSchemaEvidence(
    searchRoot: string,
    integrationRoot: string,
): Promise<readonly LocalReviewedSchemaEvidence[]> {
    const path = await findEvidencePath(searchRoot, integrationRoot);
    if (!path) {
        return [];
    }
    const bytes = await readFile(path);
    if (bytes.byteLength > MAX_EVIDENCE_BYTES) {
        throw new Error("Local reviewed schema evidence is too large");
    }
    const value = parseStrictJsonDocument(bytes, DEFAULT_INTEGRATION_PACKAGE_LIMITS.maxDocumentBytes);
    if (!equalBytes(bytes, canonicalJsonBytes(value)) || !isEvidenceDocument(value)) {
        throw new Error("Local reviewed schema evidence is not a canonical closed document");
    }
    return await Promise.all(
        value.reviewedSchemaBaselines.map(async (input) => {
            const reviewed = await parseReviewedSchemaBaseline(input);
            const identity = await identifyReviewedSchemaBaseline(reviewed);
            return {
                kind: reviewed.kind,
                version: reviewed.version,
                packageDigest: reviewed.packageDigest,
                baseline: {
                    connector: reviewed.legacySelector,
                    packageDigest: reviewed.packageDigest,
                    dependencies: reviewed.dependencies,
                    schema: projectObservedSchemaContract(reviewed.observedSchema),
                    provenance: {
                        evidenceId: `reviewed-schema-baseline-${identity.digest}`,
                        source: `${reviewed.origin}:${reviewed.policy.name}@${reviewed.policy.version}`,
                        reviewedAt: reviewed.createdAt,
                    },
                },
            };
        }),
    );
}

async function findEvidencePath(searchRoot: string, integrationRoot: string): Promise<string | null> {
    let current = integrationRoot;
    for (;;) {
        const candidate = join(current, EVIDENCE_PATH);
        const regular = await lstat(candidate).then(
            (stats) => stats.isFile() && !stats.isSymbolicLink(),
            () => false,
        );
        if (regular) {
            return candidate;
        }
        if (current === searchRoot) {
            return null;
        }
        const parent = dirname(current);
        if (parent === current || relative(searchRoot, parent).startsWith(`..${sep}`)) {
            return null;
        }
        current = parent;
    }
}

function isEvidenceDocument(
    value: unknown,
): value is Readonly<{ reviewedSchemaBaselines: readonly unknown[] }> & Record<string, unknown> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        return false;
    }
    const record = value as Record<string, unknown>;
    const keys = Object.keys(record);
    return (
        keys.length === 3 &&
        keys.includes("anonymousConstraintGrandfathering") &&
        keys.includes("reviewedSchemaBaselines") &&
        keys.includes("schema") &&
        record.schema === "cms.integration.official-bootstrap-evidence.v1" &&
        Array.isArray(record.reviewedSchemaBaselines) &&
        Array.isArray(record.anonymousConstraintGrandfathering)
    );
}

function equalBytes(left: Uint8Array, right: Uint8Array): boolean {
    return left.byteLength === right.byteLength && left.every((byte, index) => byte === right[index]);
}
