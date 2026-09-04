import { readFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
    canonicalJsonBytes,
    computeIntegrationPackageDigest,
    parseIntegrationPackageEnvelope,
    parseStrictJsonDocument,
    resolveIntegrationPackageLimits,
} from "@bernouy/cms-integration-packages";
import { loadIntegrationDefinitionFromPackageEnvelope } from "@bernouy/cms-integration-registry/fs";
import type { LocalIntegrationRepository } from "./local";

const SEED_SCHEMA = "cms.integration.official-package-history.v1";
const INDEX_RELATIVE_PATH = ".registry/packages/index.v1.json";
const MAX_INDEX_BYTES = 256 * 1_024;
const DIGEST = /^[a-f0-9]{64}$/u;

export async function importLocalPackageSeed(sourceRoot: string, local: LocalIntegrationRepository): Promise<number> {
    const indexPath = join(resolve(sourceRoot), INDEX_RELATIVE_PATH);
    let bytes: Uint8Array;
    try {
        bytes = await readFile(indexPath);
    } catch (error) {
        if (error instanceof Error && "code" in error && error.code === "ENOENT") {
            return 0;
        }
        throw error;
    }
    const index = parseSeedIndex(parseStrictJsonDocument(bytes, MAX_INDEX_BYTES));
    let imported = 0;
    for (const entry of index) {
        if (await local.getRecord(entry.kind, entry.version)) {
            continue;
        }
        const packageBytes = await readFile(join(resolve(sourceRoot), objectPath(entry.digest), "package.json"));
        const limits = resolveIntegrationPackageLimits();
        const envelope = parseIntegrationPackageEnvelope(packageBytes, { limits });
        const canonicalBytes = canonicalJsonBytes(envelope);
        const digest = await computeIntegrationPackageDigest(envelope);
        if (envelope.kind !== entry.kind || envelope.version !== entry.version || digest !== entry.digest) {
            throw new Error(`Local package seed binding is invalid for ${entry.kind}@${entry.version}`);
        }
        const result = await local.store({
            package: { envelope, canonicalBytes, digest },
            definition: loadIntegrationDefinitionFromPackageEnvelope(envelope, limits),
            source: `seed:${indexPath}`,
        });
        if (result.added) {
            imported += 1;
        }
    }
    return imported;
}

function parseSeedIndex(value: unknown): Array<{ kind: string; version: string; digest: string }> {
    if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("Local package seed index must be an object");
    }
    const record = value as Record<string, unknown>;
    if (record.schema !== SEED_SCHEMA || !Array.isArray(record.entries)) {
        throw new Error("Local package seed index has an invalid schema or entries list");
    }
    return record.entries.map((value, index) => {
        if (!value || typeof value !== "object" || Array.isArray(value)) {
            throw new Error(`Local package seed entry ${index} must be an object`);
        }
        const entry = value as Record<string, unknown>;
        if (
            typeof entry.kind !== "string" ||
            typeof entry.version !== "string" ||
            typeof entry.digest !== "string" ||
            !DIGEST.test(entry.digest)
        ) {
            throw new Error(`Local package seed entry ${index} is invalid`);
        }
        return { kind: entry.kind, version: entry.version, digest: entry.digest };
    });
}

function objectPath(digest: string): string {
    return `.registry/packages/objects/sha256/${quartet(digest[0]!)}/${quartet(digest[1]!)}/${digest}`;
}

function quartet(nibble: string): string {
    const value = Number.parseInt(nibble, 16);
    const first = Math.floor(value / 4) * 4;
    return `${first.toString(16)}-${(first + 3).toString(16)}`;
}
