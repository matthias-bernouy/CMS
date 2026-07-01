import { describe, expect, test } from "bun:test";
import { mkdtempSync, mkdirSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";

function writeJson(path: string, value: unknown): void {
    writeFileSync(path, JSON.stringify(value, null, 4) + "\n");
}

describe("FsIntegrationDefinitionRepository", () => {
    test("lists indexes and resolves stable, latest and exact versions", async () => {
        const root = mkdtempSync(join(tmpdir(), "cms-integrations-"));
        mkdirSync(join(root, "README-assets"), { recursive: true });
        const integrationRoot = join(root, "demo");
        mkdirSync(join(integrationRoot, "versions", "1.0.0"), { recursive: true });
        mkdirSync(join(integrationRoot, "versions", "1.0.1"), { recursive: true });
        writeJson(join(integrationRoot, "integration.json"), {
            schema: "cms.integration.index.v1",
            kind: "demo",
            label: "Demo",
            category: "Testing",
            stable: "1.0.0",
            latest: "1.0.1",
            versions: [
                { version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" },
                { version: "1.0.1", path: "versions/1.0.1", definition: "versions/1.0.1/definition.json" },
            ],
        });
        writeJson(join(integrationRoot, "versions", "1.0.0", "definition.json"), {
            schema: "cms.integration.definition.v1",
            kind: "demo",
            label: "Demo",
            version: "1.0.0",
            inputs: [],
        });
        writeJson(join(integrationRoot, "versions", "1.0.1", "definition.json"), {
            schema: "cms.integration.definition.v1",
            kind: "demo",
            label: "Demo",
            version: "1.0.1",
            description: "Patch release",
            inputs: [],
        });

        const stableRepo = new FsIntegrationDefinitionRepository(root);
        const latestRepo = new FsIntegrationDefinitionRepository({ root, defaultChannel: "latest" });

        expect(await stableRepo.list()).toEqual([{
            schema: "cms.integration.index.v1",
            kind: "demo",
            label: "Demo",
            category: "Testing",
            stable: "1.0.0",
            latest: "1.0.1",
            versions: ["1.0.0", "1.0.1"],
        }]);
        expect((await stableRepo.get("demo"))?.version).toBe("1.0.0");
        expect((await latestRepo.get("demo"))?.version).toBe("1.0.1");
        expect((await stableRepo.get("demo", "1.0.1"))?.description).toBe("Patch release");
        expect(await stableRepo.get("missing")).toBeNull();
        expect(await stableRepo.get("demo", "2.0.0")).toBeNull();
    });

    test("falls back to the first version when no channel is declared", async () => {
        const root = mkdtempSync(join(tmpdir(), "cms-integrations-"));
        const integrationRoot = join(root, "minimal");
        mkdirSync(join(integrationRoot, "versions", "1.0.0"), { recursive: true });
        writeJson(join(integrationRoot, "integration.json"), {
            kind: "minimal",
            label: "Minimal",
            versions: [
                { version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" },
            ],
        });
        writeJson(join(integrationRoot, "versions", "1.0.0", "definition.json"), {
            kind: "minimal",
            label: "Minimal",
            version: "1.0.0",
            inputs: [],
        });

        const repo = new FsIntegrationDefinitionRepository(root);

        expect((await repo.get("minimal"))?.version).toBe("1.0.0");
    });

    test("does not treat internal names starting with dots as path escapes", async () => {
        const root = mkdtempSync(join(tmpdir(), "cms-integrations-"));
        const integrationRoot = join(root, "..foo");
        mkdirSync(join(integrationRoot, "versions", "1.0.0"), { recursive: true });
        writeJson(join(integrationRoot, "integration.json"), {
            kind: "..foo",
            label: "Dot Foo",
            stable: "1.0.0",
            versions: [
                { version: "1.0.0", path: "versions/1.0.0", definition: "versions/1.0.0/definition.json" },
            ],
        });

        const repo = new FsIntegrationDefinitionRepository(root);

        expect((await repo.getIndex("..foo"))?.kind).toBe("..foo");
    });
});
