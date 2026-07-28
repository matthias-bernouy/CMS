import { constants, type Dirent } from "node:fs";
import { lstat, open, opendir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type {
    IntegrationRegistryCatalogDiagnostic,
    IntegrationRegistryQuarantinedEntry,
} from "../../../interfaces/catalog";

const INDEX_NAME = "integration.json";

export const RESERVED_FS_INTEGRATION_REGISTRY_DIRECTORIES = Object.freeze([
    ".registry",
    ".staging",
    ".quarantine",
    ".locks",
    ".journals",
]);
const reservedDirectories = new Set(RESERVED_FS_INTEGRATION_REGISTRY_DIRECTORIES);

export type FsIntegrationRegistryCatalogLimits = Readonly<{
    maxDepth: number;
    maxDirectories: number;
    maxIntegrations: number;
    maxIndexBytes: number;
    maxEntriesPerDirectory: number;
}>;

export const DEFAULT_FS_INTEGRATION_REGISTRY_CATALOG_LIMITS: FsIntegrationRegistryCatalogLimits = Object.freeze({
    maxDepth: 32,
    maxDirectories: 4_096,
    maxIntegrations: 4_096,
    maxIndexBytes: 1_024 * 1_024,
    maxEntriesPerDirectory: 8_192,
});

export type FsIntegrationRegistryCandidate = Readonly<{
    root: string;
    indexPath: string;
    indexBytes: Uint8Array;
}>;

export type FsIntegrationRegistryDiscovery = {
    candidates: FsIntegrationRegistryCandidate[];
    diagnostics: IntegrationRegistryCatalogDiagnostic[];
    quarantined: IntegrationRegistryQuarantinedEntry[];
};

export async function discoverIntegrationPackages(
    repositoryRoot: string,
    overrides: Partial<FsIntegrationRegistryCatalogLimits> = {},
): Promise<FsIntegrationRegistryDiscovery> {
    const limits = resolveLimits(overrides);
    const rootStats = await lstat(repositoryRoot);
    if (rootStats.isSymbolicLink() || !rootStats.isDirectory()) {
        throw new Error("Integration registry root must be a non-symlink directory");
    }
    const root = await realpath(repositoryRoot);
    const discovery: FsIntegrationRegistryDiscovery = { candidates: [], diagnostics: [], quarantined: [] };
    const visited = new Set<string>();
    let directoryCount = 0;
    await scanDirectory(root, 0);
    discovery.candidates.sort((left, right) => compareText(left.root, right.root));
    return discovery;

    async function scanDirectory(directory: string, depth: number): Promise<void> {
        if (depth > limits.maxDepth) {
            rejectStructure(directory, `Integration registry directory depth exceeds ${limits.maxDepth}`);
            return;
        }
        directoryCount += 1;
        if (directoryCount > limits.maxDirectories) {
            rejectStructure(directory, `Integration registry contains more than ${limits.maxDirectories} directories`);
            return;
        }
        let canonicalDirectory: string;
        try {
            canonicalDirectory = await realpath(directory);
        } catch (error) {
            rejectStructure(directory, errorMessage(error));
            return;
        }
        if (!isPathWithin(root, canonicalDirectory)) {
            rejectStructure(directory, "Integration registry directory escapes its root");
            return;
        }
        if (visited.has(canonicalDirectory)) {
            rejectStructure(directory, "Integration registry directory resolves to a duplicate location");
            return;
        }
        visited.add(canonicalDirectory);

        let entries: Dirent<string>[];
        try {
            entries = await readBoundedEntries(canonicalDirectory, limits.maxEntriesPerDirectory);
        } catch (error) {
            rejectStructure(canonicalDirectory, errorMessage(error));
            return;
        }
        entries.sort((left, right) => compareText(left.name, right.name));
        const indexEntry = entries.find((entry) => entry.name === INDEX_NAME);
        if (indexEntry) {
            await acceptCandidate(canonicalDirectory, indexEntry);
            return;
        }
        for (const entry of entries) {
            const path = join(canonicalDirectory, entry.name);
            if (entry.isSymbolicLink()) {
                rejectStructure(path, "Integration registry structure must not contain symlinks");
            } else if (entry.isDirectory()) {
                await scanDirectory(path, depth + 1);
            }
        }
    }

    async function acceptCandidate(directory: string, entry: Dirent<string>): Promise<void> {
        const indexPath = join(directory, INDEX_NAME);
        if (entry.isSymbolicLink() || !entry.isFile()) {
            rejectStructure(directory, `${indexPath} must be a regular file`);
            return;
        }
        try {
            const stats = await lstat(indexPath);
            if (!stats.isFile() || stats.isSymbolicLink()) {
                rejectStructure(directory, `${indexPath} must be a regular file`);
                return;
            }
            if (stats.size > limits.maxIndexBytes) {
                rejectStructure(directory, `${indexPath} exceeds ${limits.maxIndexBytes} bytes`);
                return;
            }
        } catch (error) {
            rejectStructure(directory, errorMessage(error));
            return;
        }
        if (discovery.candidates.length >= limits.maxIntegrations) {
            rejectStructure(directory, `Integration registry contains more than ${limits.maxIntegrations} packages`);
            return;
        }
        try {
            discovery.candidates.push({
                root: directory,
                indexPath,
                indexBytes: await readStableIndex(indexPath, limits.maxIndexBytes),
            });
        } catch (error) {
            rejectStructure(directory, errorMessage(error));
        }
    }

    function rejectStructure(source: string, message: string): void {
        discovery.diagnostics.push({
            code: "invalid-structure",
            stage: "discovery",
            source,
            message,
        });
        discovery.quarantined.push({ source, diagnosticCodes: ["invalid-structure"] });
    }
}

async function readBoundedEntries(directory: string, maxEntries: number): Promise<Dirent<string>[]> {
    const entries: Dirent<string>[] = [];
    const handle = await opendir(directory);
    for await (const entry of handle) {
        if (entry.isDirectory() && reservedDirectories.has(entry.name)) {
            continue;
        }
        entries.push(entry);
        if (entries.length > maxEntries) {
            throw new Error(`Integration registry directory contains more than ${maxEntries} entries`);
        }
    }
    return entries;
}

async function readStableIndex(path: string, maxBytes: number): Promise<Uint8Array> {
    const pathMetadata = await lstat(path);
    const handle = await open(path, constants.O_RDONLY | constants.O_NOFOLLOW | constants.O_NONBLOCK);
    try {
        const metadata = await handle.stat();
        assertSameFile(pathMetadata, metadata, path);
        if (!metadata.isFile() || metadata.size > maxBytes) {
            throw new Error(`${path} exceeds ${maxBytes} bytes`);
        }
        const bytes = new Uint8Array(maxBytes + 1);
        let offset = 0;
        while (offset < bytes.byteLength) {
            const { bytesRead } = await handle.read(bytes, offset, bytes.byteLength - offset, null);
            if (bytesRead === 0) {
                break;
            }
            offset += bytesRead;
        }
        if (offset > maxBytes) {
            throw new Error(`${path} exceeds ${maxBytes} bytes`);
        }
        assertSameFile(metadata, await handle.stat(), path);
        assertSameFile(metadata, await lstat(path), path);
        return bytes.subarray(0, offset);
    } finally {
        await handle.close();
    }
}

function resolveLimits(overrides: Partial<FsIntegrationRegistryCatalogLimits>): FsIntegrationRegistryCatalogLimits {
    const limits = { ...DEFAULT_FS_INTEGRATION_REGISTRY_CATALOG_LIMITS, ...overrides };
    for (const [name, value] of Object.entries(limits)) {
        if (!Number.isSafeInteger(value) || value <= 0) {
            throw new TypeError(`Integration registry catalog limit ${name} must be a positive safe integer`);
        }
    }
    return limits;
}

function isPathWithin(root: string, target: string): boolean {
    const rel = relative(root, target);
    return rel !== ".." && !rel.startsWith(`..${sep}`) && !isAbsolute(rel);
}

function errorMessage(error: unknown): string {
    return error instanceof Error ? error.message : String(error);
}

function compareText(left: string, right: string): number {
    return left < right ? -1 : left > right ? 1 : 0;
}

function assertSameFile(
    expected: Readonly<{ dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }>,
    actual: Readonly<{ dev: number; ino: number; size: number; mtimeMs: number; ctimeMs: number }>,
    path: string,
): void {
    if (
        expected.dev !== actual.dev ||
        expected.ino !== actual.ino ||
        expected.size !== actual.size ||
        expected.mtimeMs !== actual.mtimeMs ||
        expected.ctimeMs !== actual.ctimeMs
    ) {
        throw new Error(`Integration registry index changed while reading: ${path}`);
    }
}
