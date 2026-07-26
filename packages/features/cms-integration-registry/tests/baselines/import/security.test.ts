import { afterEach, describe, expect, test } from "bun:test";
import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { recoverReviewedSchemaBaselineImports } from "@bernouy/cms-integration-registry/fs";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import { cleanupRegistryFixtures } from "../../publication/fixtures";
import { baselineImportFixture } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("reviewed schema baseline import journal safety", () => {
    test("quarantines non-canonical and symlink journal entries without mutating baselines", async () => {
        const fixture = await baselineImportFixture();
        const journals = join(fixture.root, ".registry", "schema-baseline-imports", "journals");
        await mkdir(journals, { recursive: true });
        await writeFile(join(journals, "tampered.json"), '{"schema":"wrong"}\n');
        await symlink(join(journals, "tampered.json"), join(journals, "linked.json"));

        const diagnostics = await recoverReviewedSchemaBaselineImports(fixture.config);

        expect(diagnostics.map(({ code }) => code)).toEqual([
            "schema-baseline-import-quarantined",
            "schema-baseline-import-quarantined",
        ]);
        expect(await fixture.reviewedSchemaBaselines.listAll()).toEqual([]);
    });

    test("quarantines a journal when the approved policy changes before replay", async () => {
        const fixture = await baselineImportFixture({
            afterBoundary(boundary) {
                if (boundary.phase === "prepared") {
                    throw new Error("crash-prepared");
                }
            },
        });
        await expect(fixture.importer.importBaseline(fixture.request)).rejects.toThrow();

        const diagnostics = await recoverReviewedSchemaBaselineImports({
            ...fixture.config,
            afterBoundary: undefined,
            approval: {
                ...fixture.config.approval,
                provenanceActors: [...fixture.config.approval.provenanceActors, "second-approved-actor"],
            },
        });

        expect(diagnostics).toEqual([expect.objectContaining({ code: "schema-baseline-import-quarantined" })]);
        expect(await fixture.reviewedSchemaBaselines.listAll()).toEqual([]);
    });

    test("rejects a parseable but non-canonical journal timestamp", async () => {
        const fixture = await baselineImportFixture({
            afterBoundary(boundary) {
                if (boundary.phase === "prepared") {
                    throw new Error("crash-prepared");
                }
            },
        });
        await expect(fixture.importer.importBaseline(fixture.request)).rejects.toThrow();
        const path = join(fixture.root, ".registry", "schema-baseline-imports", "journals", "baseline-import-1.json");
        const journal = JSON.parse(await readFile(path, "utf8"));
        await chmod(path, 0o640);
        await writeFile(path, canonicalJsonBytes({ ...journal, createdAt: "2026-07-26T12:00:00Z" }));

        const diagnostics = await recoverReviewedSchemaBaselineImports({ ...fixture.config, afterBoundary: undefined });

        expect(diagnostics).toEqual([expect.objectContaining({ code: "schema-baseline-import-quarantined" })]);
        expect(await fixture.reviewedSchemaBaselines.listAll()).toEqual([]);
    });
});
