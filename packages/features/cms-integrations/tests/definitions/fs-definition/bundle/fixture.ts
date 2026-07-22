import { mkdirSync, mkdtempSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { dirname, join } from "node:path";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";

export type BundleFixture = ReturnType<typeof createBundleFixture>;

export function createBundleFixture(kind = "demo") {
    const repositoryRoot = mkdtempSync(join(tmpdir(), "cms-definition-bundle-"));
    const packageRoot = join(repositoryRoot, kind);
    const versionRoot = join(packageRoot, "versions", "1.0.0");
    const definitionPath = join(versionRoot, "definition.json");
    mkdirSync(versionRoot, { recursive: true });
    writeJsonFile(join(packageRoot, "integration.json"), {
        kind,
        label: "Demo",
        stable: "1.0.0",
        versions: [{ version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" }],
    });
    return {
        definitionPath,
        kind,
        packageRoot,
        repository: new FsIntegrationDefinitionRepository(repositoryRoot),
        repositoryRoot,
        versionRoot,
        bundle(root = "definitions/root.json") {
            writeJsonFile(definitionPath, { schema: "cms.integration.definition.bundle.v1", root });
        },
        canonical(overrides: Record<string, unknown> = {}) {
            return {
                schema: "cms.integration.definition.v1",
                kind,
                label: "Demo",
                version: "1.0.0",
                inputs: [],
                ...overrides,
            };
        },
        write(path: string, value: unknown) {
            writeJsonFile(join(versionRoot, path), value);
        },
        writeText(path: string, value: string) {
            writeTextFile(join(versionRoot, path), value);
        },
    };
}

export function writeJsonFile(path: string, value: unknown): void {
    writeTextFile(path, `${JSON.stringify(value, null, 4)}\n`);
}

export function writeTextFile(path: string, value: string): void {
    mkdirSync(dirname(path), { recursive: true });
    writeFileSync(path, value);
}
