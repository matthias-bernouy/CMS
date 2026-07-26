import { afterEach, describe, expect, test } from "bun:test";
import { readdirSync } from "node:fs";
import { join } from "node:path";
import {
    FS_INTEGRATION_REGISTRY_PUBLICATION_PHASES,
    FsIntegrationRegistryRecoverer,
    FsIntegrationRegistrySimulatedCrashError,
    type FsIntegrationRegistryPublicationPhase,
} from "@bernouy/cms-integration-registry/fs";
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
});

function crashFixture(phase: FsIntegrationRegistryPublicationPhase) {
    return registryFixture({
        createOperationId: () => `crash-${phase}`,
        afterBoundary: (boundary) => {
            if (boundary.phase === phase) {
                throw new Error(`crash after ${phase}`);
            }
        },
    });
}
