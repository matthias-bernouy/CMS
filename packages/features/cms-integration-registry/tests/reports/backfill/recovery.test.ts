import { afterEach, describe, expect, test } from "bun:test";
import { chmod, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { canonicalJsonBytes } from "@bernouy/cms-integration-packages";
import {
    FS_INTEGRATION_VERIFICATION_BACKFILL_PHASES,
    FsIntegrationVerificationBackfiller,
    recoverIntegrationVerificationBackfills,
} from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures } from "../../publication/fixtures";
import { populatedBackfillFixture } from "./support";

afterEach(cleanupRegistryFixtures);

describe("populated registry verification backfill recovery", () => {
    for (const phase of FS_INTEGRATION_VERIFICATION_BACKFILL_PHASES) {
        test(`replays an exact crash after ${phase}`, async () => {
            const context = await populatedBackfillFixture({
                afterBoundary(boundary) {
                    if (boundary.phase === phase) {
                        throw new Error("simulated process death");
                    }
                },
            });
            await expect(context.backfiller.backfill(context.request)).rejects.toMatchObject({
                name: "FsIntegrationVerificationBackfillSimulatedCrashError",
                boundary: { phase },
            });

            const restartedConfig = { ...context.config, afterBoundary: undefined };
            const diagnostics = await recoverIntegrationVerificationBackfills(restartedConfig);

            expect(diagnostics).toHaveLength(1);
            expect(diagnostics[0]).toMatchObject({
                code: "verification-backfill-replayed",
                operationId: "verification-backfill-operation",
                kind: "demo",
                version: "1.0.0",
            });
            expect(context.fixture.snapshots.current().getIndex("demo")?.versions[0]?.verificationDigest).toBe(
                context.entry.verification.digest,
            );
            expect(await recoverIntegrationVerificationBackfills(restartedConfig)).toEqual([]);
            await expect(
                new FsIntegrationVerificationBackfiller(restartedConfig).backfill(context.request),
            ).resolves.toMatchObject({
                outcome: "unchanged",
            });
        });
    }

    test("quarantines a forged activation journal without activating its index", async () => {
        const context = await populatedBackfillFixture({
            afterBoundary(boundary) {
                if (boundary.phase === "activation-prepared") {
                    throw new Error("simulated process death");
                }
            },
        });
        await expect(context.backfiller.backfill(context.request)).rejects.toBeDefined();
        const journalPath = join(
            context.fixture.root,
            ".registry/verification-backfills/journals/verification-backfill-operation.json",
        );
        const journal = JSON.parse(await readFile(journalPath, "utf8"));
        journal.activation.nextIndex.label = "Forged label";
        await chmod(journalPath, 0o640);
        await writeFile(journalPath, canonicalJsonBytes(journal));

        const diagnostics = await recoverIntegrationVerificationBackfills({
            ...context.config,
            afterBoundary: undefined,
        });

        expect(diagnostics).toHaveLength(1);
        expect(diagnostics[0]).toMatchObject({ code: "verification-backfill-quarantined" });
        expect(context.fixture.snapshots.current().getIndex("demo")?.versions[0]?.verificationDigest).toBeUndefined();
        expect(await Bun.file(journalPath).exists()).toBe(false);
    });

    test("resumes an exact monotone prefix after its journal is quarantined", async () => {
        const context = await populatedBackfillFixture({
            afterBoundary(boundary) {
                if (boundary.phase === "verification-written") {
                    throw new Error("simulated process death");
                }
            },
        });
        await expect(context.backfiller.backfill(context.request)).rejects.toBeDefined();
        const journalPath = join(
            context.fixture.root,
            ".registry/verification-backfills/journals/verification-backfill-operation.json",
        );
        await chmod(journalPath, 0o640);
        await writeFile(journalPath, "{not-json");

        const restartedConfig = { ...context.config, afterBoundary: undefined };
        await expect(recoverIntegrationVerificationBackfills(restartedConfig)).resolves.toEqual([
            expect.objectContaining({ code: "verification-backfill-quarantined" }),
        ]);
        await expect(
            new FsIntegrationVerificationBackfiller(restartedConfig).backfill(context.request),
        ).resolves.toMatchObject({ outcome: "backfilled" });
        expect(context.fixture.snapshots.current().getIndex("demo")).toMatchObject({
            stable: "1.0.0",
            latest: "1.0.0",
            versions: [{ verificationDigest: context.entry.verification.digest }],
        });
    });

    test("revalidates request approval before replaying a durable journal", async () => {
        const context = await populatedBackfillFixture({
            afterBoundary(boundary) {
                if (boundary.phase === "prepared") {
                    throw new Error("simulated process death");
                }
            },
        });
        await expect(context.backfiller.backfill(context.request)).rejects.toBeDefined();

        const diagnostics = await recoverIntegrationVerificationBackfills({
            ...context.config,
            approvedRequestDigests: [],
            afterBoundary: undefined,
        });

        expect(diagnostics).toEqual([
            expect.objectContaining({
                code: "verification-backfill-quarantined",
                message: expect.stringContaining("not approved"),
            }),
        ]);
        expect(await context.bundles.get(context.entry.verification.digest)).toBeNull();
        expect(await context.stores.compatibilityReports.get("demo", "1.0.0")).toBeNull();
        expect(await context.stores.verificationReports.get("demo", "1.0.0")).toBeNull();
        expect(await context.stores.decisions.get("demo", "1.0.0")).toBeNull();
        expect(context.fixture.snapshots.current().getIndex("demo")?.versions[0]?.verificationDigest).toBeUndefined();
    });
});
