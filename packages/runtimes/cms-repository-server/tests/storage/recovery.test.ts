import { afterEach, describe, expect, test } from "bun:test";
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import { buildFsIntegrationRegistryCatalogSnapshot } from "@bernouy/cms-integration-registry/fs";
import { RepositoryCatalogRuntime } from "../../src/core/catalogRuntime";
import { createProductionRepositoryManagement } from "../../src/management";
import { TemporaryRoots } from "./fixtures";

const roots = new TemporaryRoots();

afterEach(async () => await roots.cleanup());

describe("production repository recovery", () => {
    test("recovers release report histories before composite admission reconciliation", async () => {
        const root = await roots.create();
        await mkdir(join(root, ".registry", "release-reports", "compatibility", "not-a-digest"), {
            recursive: true,
        });
        const catalog = new RepositoryCatalogRuntime();
        expect((await catalog.refresh(() => buildFsIntegrationRegistryCatalogSnapshot({ root }))).applied).toBeTrue();

        const management = await createProductionRepositoryManagement({ root, catalog });

        expect(management.recovery.diagnostics).toContainEqual(
            expect.objectContaining({
                code: "release-report-history-quarantined",
                message: "Quarantined invalid compatibility release report history",
            }),
        );
    });
});
