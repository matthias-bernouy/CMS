import { afterEach, describe, expect, test } from "bun:test";
import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import {
    FS_INTEGRATION_REGISTRY_PUBLICATION_PHASES,
    FsIntegrationRegistryRecoverer,
    FsIntegrationRegistrySimulatedCrashError,
    type FsIntegrationRegistryPublicationPhase,
} from "@bernouy/cms-integration-registry/fs";
import { prepareFsIntegrationRegistryCandidate } from "../../src/default-implementation/fs/registry/publication/candidate";
import { publishPreparedFsIntegrationRegistryCandidate } from "../../src/default-implementation/fs/registry/publication/publisher";
import { cleanupRegistryFixtures, publicationPackage, registryFixture } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("filesystem integration registry publication recovery", () => {
    for (const phase of FS_INTEGRATION_REGISTRY_PUBLICATION_PHASES) {
        test(`replays a crash after ${phase} and is idempotent`, async () => {
            const fixture = crashFixture(phase);
            const input = await publicationPackage("recovery-demo", "1.0.0");

            await expect(fixture.publisher.publish({ package: input })).rejects.toBeInstanceOf(
                FsIntegrationRegistrySimulatedCrashError,
            );
            expect(readdirSync(join(fixture.root, ".journals"))).toEqual([`crash-${phase}.json`]);
            expect(readCrashJournal(fixture.root, phase)).toMatchObject({
                schema: "cms.integration.registry.publication-journal.v2",
                publication: { disposition: "installable" },
            });

            const first = await new FsIntegrationRegistryRecoverer({
                root: fixture.root,
                snapshots: fixture.snapshots,
            }).recover();

            expect(first.diagnostics).toEqual([
                expect.objectContaining({
                    code: "publication-replayed",
                    operationId: `crash-${phase}`,
                    kind: "recovery-demo",
                    version: "1.0.0",
                }),
            ]);
            expect(first.snapshot.locateExactVersion("recovery-demo", "1.0.0")?.package.digest).toBe(input.digest);
            expect(readdirSync(join(fixture.root, ".journals"))).toEqual([]);
            expect(readdirSync(join(fixture.root, ".staging"))).toEqual([]);

            const second = await new FsIntegrationRegistryRecoverer({
                root: fixture.root,
                snapshots: fixture.snapshots,
            }).recover();
            expect(second.diagnostics).toEqual([]);
            expect(second.snapshot.locateExactVersion("recovery-demo", "1.0.0")?.package.digest).toBe(input.digest);
        });
    }

    for (const phase of FS_INTEGRATION_REGISTRY_PUBLICATION_PHASES) {
        test(`replays an unverified raw publication after ${phase} without advancing channels`, async () => {
            const fixture = crashFixture(phase, "publish-unverified");
            const input = await publicationPackage("raw-recovery-demo", "1.0.0");

            await expect(fixture.rawPublisher.publish({ package: input })).rejects.toBeInstanceOf(
                FsIntegrationRegistrySimulatedCrashError,
            );
            expect(readCrashJournal(fixture.root, phase)).toMatchObject({
                schema: "cms.integration.registry.publication-journal.v2",
                publication: { disposition: "unverified" },
            });
            const recovered = await new FsIntegrationRegistryRecoverer({
                root: fixture.root,
                snapshots: fixture.snapshots,
            }).recover();

            expect(recovered.snapshot.getIndex("raw-recovery-demo")).toMatchObject({
                versions: [{ version: "1.0.0", status: "unverified" }],
            });
            expect(recovered.snapshot.getIndex("raw-recovery-demo")?.stable).toBeUndefined();
            expect(recovered.snapshot.getIndex("raw-recovery-demo")?.latest).toBeUndefined();
            expect(readdirSync(join(fixture.root, ".journals"))).toEqual([]);
            expect(readdirSync(join(fixture.root, ".staging"))).toEqual([]);
        });
    }

    test("preserves the exact verification digest of an unverified candidate during recovery", async () => {
        const fixture = crashFixture("version-live");
        const input = await publicationPackage("verified-recovery-demo", "1.0.0");
        const candidate = await prepareFsIntegrationRegistryCandidate(input);
        const verificationDigest = "e".repeat(64);

        await expect(
            publishPreparedFsIntegrationRegistryCandidate(
                fixture.publicationConfig,
                candidate,
                undefined,
                undefined,
                "unverified",
                verificationDigest,
            ),
        ).rejects.toBeInstanceOf(FsIntegrationRegistrySimulatedCrashError);
        expect(readCrashJournal(fixture.root, "version-live").publication).toEqual({
            disposition: "unverified",
            verificationDigest,
        });

        const recovered = await new FsIntegrationRegistryRecoverer({
            root: fixture.root,
            snapshots: fixture.snapshots,
        }).recover();

        expect(recovered.snapshot.getIndex("verified-recovery-demo")).toMatchObject({
            versions: [{ version: "1.0.0", status: "unverified", verificationDigest }],
        });
    });
});

function readCrashJournal(root: string, phase: FsIntegrationRegistryPublicationPhase): Record<string, unknown> {
    return JSON.parse(readFileSync(join(root, ".journals", `crash-${phase}.json`), "utf8")) as Record<string, unknown>;
}

function crashFixture(
    phase: FsIntegrationRegistryPublicationPhase,
    rawPublicationPolicy: "publish-unverified" | "reject-unverified" = "reject-unverified",
) {
    return registryFixture({
        rawPublicationPolicy,
        createOperationId: () => `crash-${phase}`,
        afterBoundary: (boundary) => {
            if (boundary.phase === phase) {
                throw new Error(`crash after ${phase}`);
            }
        },
    });
}
