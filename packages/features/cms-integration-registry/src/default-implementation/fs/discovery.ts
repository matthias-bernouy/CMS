import type { Dirent } from "node:fs";
import { lstat, readdir, realpath } from "node:fs/promises";
import { isAbsolute, join, relative, sep } from "node:path";
import type {
    IntegrationRegistryCatalogDiagnostic,
    IntegrationRegistryQuarantinedEntry,
} from "../../interfaces/catalog";

const INDEX_NAME = "integration.json";

export type FsIntegrationRegistryCatalogLimits = Readonly<{
    maxDepth: number;
    maxDirectories: number;
    maxIntegrations: number;
    maxIndexBytes: number;
}>;

export const DEFAULT_FS_INTEGRATION_REGISTRY_CATALOG_LIMITS: FsIntegrationRegistryCatalogLimits = Object.freeze({
    maxDepth: 32,
    maxDirectories: 4_096,
    maxIntegrations: 4_096,
    maxIndexBytes: 1_024 * 1_024,
});

export type FsIntegrationRegistryDiscovery = {
    candidates: string[];
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
    discovery.candidates.sort(compareText);
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
            entries = await readdir(canonicalDirectory, { withFileTypes: true });
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
        discovery.candidates.push(directory);
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
