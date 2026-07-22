import { lstat, readdir, readFile, realpath } from "node:fs/promises";
import { basename, join, relative, sep } from "node:path";
import type {
    IntegrationDefinitionIndex,
    IntegrationDefinitionVersion,
} from "../../interfaces/IntegrationDefinitionRepository";
import {
    assertPathWithin,
    parseIntegrationDefinitionIndex,
    resolveExistingPathWithin,
    safeJoinWithin,
} from "./repositorySupport";

const INTEGRATION_INDEX_NAME = "integration.json";

export type LocatedIntegrationPackage = {
    index: IntegrationDefinitionIndex;
    indexPath: string;
    root: string;
};

export type LocatedIntegrationVersion = {
    entry: IntegrationDefinitionVersion;
    package: LocatedIntegrationPackage;
    root: string;
};

export class IntegrationPackageLocator {
    constructor(private readonly repositoryRoot: string) {}

    async list(): Promise<LocatedIntegrationPackage[]> {
        const rootStats = await lstat(this.repositoryRoot);
        if (rootStats.isSymbolicLink()) {
            throw new Error("Integration repository root must not be a symlink");
        }
        if (!rootStats.isDirectory()) {
            throw new Error("Integration repository root must be a directory");
        }

        const root = await realpath(this.repositoryRoot);
        const packages: LocatedIntegrationPackage[] = [];
        await this.scanDirectory(root, root, packages);
        this.assertUniquePackages(packages, root);
        return packages;
    }

    async get(kind: string): Promise<LocatedIntegrationPackage | null> {
        return (await this.list()).find((item) => item.index.kind === kind) ?? null;
    }

    async getVersion(kind: string, version: string): Promise<LocatedIntegrationVersion | null> {
        const locatedPackage = await this.get(kind);
        if (!locatedPackage) {
            return null;
        }
        const entry = locatedPackage.index.versions.find((item) => item.version === version);
        if (!entry) {
            return null;
        }
        return {
            entry,
            package: locatedPackage,
            root: await resolveExistingPathWithin(locatedPackage.root, "version", entry.path),
        };
    }

    private async scanDirectory(
        repositoryRoot: string,
        directory: string,
        packages: LocatedIntegrationPackage[],
    ): Promise<void> {
        const canonicalDirectory = await realpath(directory);
        assertPathWithin(repositoryRoot, canonicalDirectory, "repository", relative(repositoryRoot, directory));
        const entries = (await readdir(canonicalDirectory, { withFileTypes: true })).sort(compareEntries);
        const indexEntry = entries.find((entry) => entry.name === INTEGRATION_INDEX_NAME);
        if (indexEntry) {
            if (indexEntry.isSymbolicLink() || !indexEntry.isFile()) {
                throw new Error(`${join(canonicalDirectory, INTEGRATION_INDEX_NAME)} must be a regular file`);
            }
            packages.push(await this.readPackage(canonicalDirectory));
            return;
        }

        for (const entry of entries) {
            if (entry.isSymbolicLink()) {
                throw new Error(`Integration repository structure must not contain symlinks: ${entry.name}`);
            }
            if (entry.isDirectory()) {
                await this.scanDirectory(repositoryRoot, join(canonicalDirectory, entry.name), packages);
            }
        }
    }

    private async readPackage(packageRoot: string): Promise<LocatedIntegrationPackage> {
        const indexPath = join(packageRoot, INTEGRATION_INDEX_NAME);
        const parsed = JSON.parse(await readFile(indexPath, "utf-8"));
        const index = parseIntegrationDefinitionIndex(parsed, indexPath);
        if (index.kind !== basename(packageRoot)) {
            throw new Error(
                `${indexPath}: index kind "${index.kind}" does not match directory "${basename(packageRoot)}"`,
            );
        }
        this.assertUniqueVersionPaths(index, packageRoot, indexPath);
        return { index, indexPath, root: packageRoot };
    }

    private assertUniqueVersionPaths(index: IntegrationDefinitionIndex, packageRoot: string, source: string): void {
        const versions = new Set<string>();
        const paths = new Set<string>();
        for (const entry of index.versions) {
            if (versions.has(entry.version)) {
                throw new Error(`${source}: duplicate version "${entry.version}"`);
            }
            const normalizedPath = safeJoinWithin(packageRoot, "version", entry.path);
            if (paths.has(normalizedPath)) {
                throw new Error(`${source}: duplicate version path "${entry.path}"`);
            }
            versions.add(entry.version);
            paths.add(normalizedPath);
        }
    }

    private assertUniquePackages(packages: LocatedIntegrationPackage[], repositoryRoot: string): void {
        const kinds = new Map<string, string>();
        const roots = new Set<string>();
        for (const locatedPackage of packages) {
            const previousPath = kinds.get(locatedPackage.index.kind);
            if (previousPath) {
                throw new Error(
                    `Duplicate integration kind "${locatedPackage.index.kind}" in ${previousPath} and ${locatedPackage.indexPath}`,
                );
            }
            const packagePath = relative(repositoryRoot, locatedPackage.root).split(sep).join("/");
            if (roots.has(packagePath)) {
                throw new Error(`Duplicate integration package path "${packagePath}"`);
            }
            kinds.set(locatedPackage.index.kind, locatedPackage.indexPath);
            roots.add(packagePath);
        }
    }
}

function compareEntries(left: { name: string }, right: { name: string }): number {
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}
