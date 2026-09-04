import { randomUUID } from "node:crypto";
import { chmod, readFile, rename, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    LOCAL_REPOSITORY_SCHEMA,
    parseManifest,
    type LocalPackageAdmission,
    type LocalPackageMetadata,
    type LocalPackageRecord,
    type LocalRepositoryManifest,
} from "./manifestModel";

const MAX_MANIFEST_BYTES = 16 * 1_024 * 1_024;

export type { LocalPackageAdmission, LocalPackageMetadata, LocalPackageRecord } from "./manifestModel";
export { compactDefinitionRecord } from "./manifestModel";

export async function readManifest(root: string): Promise<LocalRepositoryManifest> {
    const path = manifestPath(root);
    const bytes = await readFile(path).catch((error: NodeJS.ErrnoException) => {
        if (error.code === "ENOENT") {
            return null;
        }
        throw error;
    });
    if (!bytes) {
        return { schema: LOCAL_REPOSITORY_SCHEMA, packages: [] };
    }
    if (bytes.byteLength > MAX_MANIFEST_BYTES) {
        throw new Error("Local repository manifest is too large");
    }
    return parseManifest(JSON.parse(new TextDecoder().decode(bytes)));
}

export async function writeManifest(root: string, records: readonly LocalPackageRecord[]): Promise<void> {
    const manifest: LocalRepositoryManifest = {
        schema: LOCAL_REPOSITORY_SCHEMA,
        packages: [...records].sort((left, right) => coordinate(left).localeCompare(coordinate(right))).map(portable),
    };
    const path = manifestPath(root);
    const temporary = join(root, `.catalog-${randomUUID()}.tmp`);
    await writeFile(temporary, canonicalJsonBytes(manifest), { flag: "wx", mode: 0o600 });
    await rename(temporary, path);
    await chmod(path, 0o600);
}

function portable(record: LocalPackageRecord): LocalPackageRecord {
    return {
        kind: record.kind,
        version: record.version,
        digest: record.digest,
        ...(record.verificationDigest ? { verificationDigest: record.verificationDigest } : {}),
        source: record.source,
        pulledAt: record.pulledAt,
        ...(record.admission ? { admission: { ...record.admission } } : {}),
        metadata: portableMetadata(record.metadata),
        dependencies: record.dependencies.map((dependency) => ({ ...dependency })),
    };
}

function portableMetadata(metadata: LocalPackageMetadata): LocalPackageMetadata {
    return {
        label: metadata.label,
        ...(metadata.type ? { type: metadata.type } : {}),
        ...(metadata.icon ? { icon: { ...metadata.icon } } : {}),
        ...(metadata.category ? { category: metadata.category } : {}),
        ...(metadata.description ? { description: metadata.description } : {}),
    };
}

function manifestPath(root: string): string {
    return join(root, "catalog.json");
}

function coordinate(record: Pick<LocalPackageRecord, "kind" | "version">): string {
    return `${record.kind}@${record.version}`;
}
