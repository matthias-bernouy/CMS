import { afterEach, describe, expect, test } from "bun:test";
import {
    FsReviewedSchemaBaselineImporter,
    FsReviewedSchemaBaselineImportSimulatedCrashError,
    recoverReviewedSchemaBaselineImports,
} from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures } from "../../publication/fixtures";
import { baselineImportFixture } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("reviewed schema baseline import recovery", () => {
    for (const phase of ["prepared", "baseline-written"] as const) {
        test(`replays an exact crash after ${phase}`, async () => {
            const fixture = await baselineImportFixture({
                afterBoundary(boundary) {
                    if (boundary.phase === phase) {
                        throw new Error(`crash-${phase}`);
                    }
                },
            });

            await expect(fixture.importer.importBaseline(fixture.request)).rejects.toBeInstanceOf(
                FsReviewedSchemaBaselineImportSimulatedCrashError,
            );
            const diagnostics = await recoverReviewedSchemaBaselineImports({
                ...fixture.config,
                afterBoundary: undefined,
            });

            expect(diagnostics).toEqual([
                expect.objectContaining({
                    code: "schema-baseline-import-replayed",
                    operationId: "baseline-import-1",
                    kind: "demo",
                    version: "1.0.0",
                }),
            ]);
            expect(await fixture.reviewedSchemaBaselines.listAll()).toHaveLength(1);
            expect(await recoverReviewedSchemaBaselineImports(fixture.config)).toEqual([]);
            expect(
                (await new FsReviewedSchemaBaselineImporter(fixture.config).importBaseline(fixture.request)).outcome,
            ).toBe("unchanged");
        });
    }
});
