import { describe, expect, test } from "bun:test";
import { access, readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, sep } from "node:path";
import { readIntegrationPackageDirectory } from "@bernouy/cms-integration-packages/fs";
import { OFFICIAL_INTEGRATIONS_ROOT } from "@bernouy/cms-official-integrations";

describe("official integration package protocol", () => {
    test("builds every official version deterministically", async () => {
        const indexPaths = await findIndexes(OFFICIAL_INTEGRATIONS_ROOT);
        const digests = new Set<string>();
        let versions = 0;

        for (const indexPath of indexPaths) {
            const packageRoot = dirname(indexPath);
            const index = JSON.parse(await readFile(indexPath, "utf8")) as IntegrationIndex;
            for (const entry of index.versions) {
                const versionRoot = join(packageRoot, entry.path);
                const definition = relative(versionRoot, join(packageRoot, entry.definition)).split(sep).join("/");
                const releaseNotes = await releaseNotesPath(versionRoot);
                const first = await readIntegrationPackageDirectory({
                    root: versionRoot,
                    kind: index.kind,
                    version: entry.version,
                    definition,
                    releaseNotes,
                    ...(entry.path === "." ? { excludeRootEntries: [".registry", "integration.json", "tests"] } : {}),
                });
                const second = await readIntegrationPackageDirectory({
                    root: versionRoot,
                    kind: index.kind,
                    version: entry.version,
                    definition,
                    releaseNotes,
                    ...(entry.path === "." ? { excludeRootEntries: [".registry", "integration.json", "tests"] } : {}),
                });

                expect(first.envelope).toMatchObject({
                    kind: index.kind,
                    version: entry.version,
                    definition,
                    releaseNotes,
                });
                expect(first.digest).toBe(second.digest);
                expect(first.canonicalBytes).toEqual(second.canonicalBytes);
                digests.add(first.digest);
                versions += 1;
            }
        }

        expect(indexPaths).toHaveLength(19);
        expect(versions).toBe(19);
        expect(digests.size).toBe(19);
    });
});

type IntegrationIndex = {
    kind: string;
    versions: Array<{ version: string; path: string; definition: string }>;
};

async function findIndexes(directory: string): Promise<string[]> {
    const indexes: string[] = [];
    for (const entry of (await readdir(directory, { withFileTypes: true })).sort(compareEntries)) {
        if (!entry.isDirectory()) {
            continue;
        }
        const child = join(directory, entry.name);
        const children = await readdir(child, { withFileTypes: true });
        if (children.some((candidate) => candidate.isFile() && candidate.name === "integration.json")) {
            indexes.push(join(child, "integration.json"));
        } else {
            indexes.push(...(await findIndexes(child)));
        }
    }
    return indexes;
}

async function releaseNotesPath(versionRoot: string): Promise<string> {
    try {
        await access(join(versionRoot, "release-notes.txt"));
        return "release-notes.txt";
    } catch {
        return "README.md";
    }
}

function compareEntries(left: { name: string }, right: { name: string }): number {
    return left.name < right.name ? -1 : left.name > right.name ? 1 : 0;
}
