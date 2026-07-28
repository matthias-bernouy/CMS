import { afterEach, describe, expect, test } from "bun:test";
import { mkdirSync, mkdtempSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { IntegrationRegistryCatalogSnapshotReference } from "@bernouy/cms-integration-registry";
import {
    buildFsIntegrationRegistryCatalogSnapshot,
    SnapshotIntegrationDefinitionRepository,
} from "@bernouy/cms-integration-registry/fs";
import { FsIntegrationDefinitionRepository } from "@bernouy/cms-integrations/fs";
import { writeIntegrationFixture, writeJson } from "./fixtures";

const roots: string[] = [];

afterEach(() => {
    for (const root of roots.splice(0)) {
        rmSync(root, { recursive: true, force: true });
    }
});

describe("bounded snapshot definition hydration", () => {
    test("matches the existing loader for an official fragmented definition with blocs", async () => {
        const officialRoot = resolve(
            import.meta.dir,
            "../../../../resources/official-integrations/integrations/foundation",
        );
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root: officialRoot });
        const snapshotRepository = new SnapshotIntegrationDefinitionRepository({
            snapshots: new IntegrationRegistryCatalogSnapshotReference(snapshot),
        });
        const filesystemRepository = new FsIntegrationDefinitionRepository(officialRoot);

        expect(await snapshotRepository.get("basic-blocs", "1.0.0")).toEqual(
            await filesystemRepository.get("basic-blocs", "1.0.0"),
        );
    });

    test("detects the same fragmented-definition cycle as the existing filesystem resolver", async () => {
        const root = registryRoot();
        const integrationRoot = writeIntegrationFixture(root, "cycle");
        const versionRoot = join(integrationRoot, "versions", "1.0.0");
        const definitions = join(versionRoot, "definitions");
        mkdirSync(definitions);
        writeJson(join(versionRoot, "definition.json"), {
            schema: "cms.integration.definition.bundle.v1",
            root: "definitions/root.json",
        });
        writeJson(join(definitions, "root.json"), {
            schema: "cms.integration.definition.v1",
            kind: "cycle",
            label: "Cycle",
            version: "1.0.0",
            inputs: { $include: "cycle.json" },
        });
        writeJson(join(definitions, "cycle.json"), { $include: "root.json" });
        const filesystemRepository = new FsIntegrationDefinitionRepository(root);

        await expect(filesystemRepository.get("cycle", "1.0.0")).rejects.toThrow(/Cyclic integration definition/);
        const snapshot = await buildFsIntegrationRegistryCatalogSnapshot({ root });
        expect(snapshot.diagnostics).toEqual([
            expect.objectContaining({
                code: "invalid-package",
                message: expect.stringContaining("Cyclic integration definition"),
            }),
        ]);
    });
});

function registryRoot(): string {
    const root = mkdtempSync(join(tmpdir(), "cms-integration-definition-parity-"));
    roots.push(root);
    return root;
}
