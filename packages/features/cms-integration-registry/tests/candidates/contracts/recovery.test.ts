import { afterEach, expect, test } from "bun:test";
import { FsIntegrationRegistryCandidateFinalizer } from "@bernouy/cms-integration-registry/fs";
import { cleanupRegistryFixtures, registryFixture } from "../../publication/fixtures";
import { finalizerConfig, releaseStores } from "../finalization/fixtures";
import { passedContractRelease, publicApiContract, verificationContractCatalog } from "./fixtures";

afterEach(cleanupRegistryFixtures);

test("replays activation without duplicating a lineage revision", async () => {
    const fixture = registryFixture();
    const release = await passedContractRelease(fixture, {
        candidateId: "contract-recovery",
        version: "1.0.0",
        contracts: publicApiContract("^1.0.0"),
    });
    const stores = releaseStores(fixture);
    let interrupted = false;
    const crashing = new FsIntegrationRegistryCandidateFinalizer({
        ...finalizerConfig(fixture, release.store, release.policy, stores),
        afterActivationPhase(phase) {
            if (phase === "prepared" && !interrupted) {
                interrupted = true;
                throw new Error("simulated lineage activation interruption");
            }
        },
    });

    await expect(crashing.finalize("contract-recovery")).rejects.toThrow(/simulated lineage activation/u);
    expect(await verificationContractCatalog(fixture).listActive("demo", "1.1.0")).toEqual([]);

    const recovered = new FsIntegrationRegistryCandidateFinalizer(
        finalizerConfig(fixture, release.store, release.policy, stores),
    );
    await expect(recovered.recover("contract-recovery")).resolves.toMatchObject({ status: "published" });
    const active = await verificationContractCatalog(fixture).listActive("demo", "1.1.0");
    expect(active).toHaveLength(1);
    expect(active[0]?.reference).toMatchObject({ contractId: "public-api", ownerVersion: "1.0.0" });
});
