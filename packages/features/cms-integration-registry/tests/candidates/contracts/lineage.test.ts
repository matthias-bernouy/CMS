import { afterEach, describe, expect, test } from "bun:test";
import { chmod, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { cleanupRegistryFixtures, registryFixture } from "../../publication/fixtures";
import { releaseFinalizer } from "../finalization/fixtures";
import { passedContractRelease, publicApiContract, verificationContractCatalog } from "./fixtures";

afterEach(cleanupRegistryFixtures);

describe("persistent verification contract lineage", () => {
    test("restarts with the exact owner bundle and carries its source closure through the major", async () => {
        const fixture = registryFixture();
        const first = await passedContractRelease(fixture, {
            candidateId: "contract-v1",
            version: "1.0.0",
            contracts: publicApiContract("^1.0.0"),
        });
        await releaseFinalizer(fixture, first.store, first.policy).finalize("contract-v1");

        const restarted = verificationContractCatalog(fixture);
        const [persisted] = await restarted.listActive("demo", "1.7.0");
        expect(persisted).toMatchObject({
            reference: { contractId: "public-api", ownerVersion: "1.0.0" },
            ownerPackageDigest: first.candidate.packageDigest,
            ownerVerificationDigest: first.candidate.verificationDigest,
            content: { suite: { contractId: "public-api", entrypoint: "tests/contract.ts" } },
        });

        const compatible = await passedContractRelease(fixture, {
            candidateId: "contract-v1-1",
            version: "1.1.0",
        });
        expect(compatible.plan.admission.activeContracts).toEqual([persisted?.reference]);
        expect(compatible.plan.admission.suites.find(({ suiteId }) => suiteId === "public-api")?.contentDigest).toBe(
            persisted?.reference.contractDigest,
        );
    });

    test("rejects an author override inside a major and permits a new major lineage root", async () => {
        const fixture = registryFixture();
        const first = await passedContractRelease(fixture, {
            candidateId: "contract-root-v1",
            version: "1.0.0",
            contracts: publicApiContract("^1.0.0"),
        });
        await releaseFinalizer(fixture, first.store, first.policy).finalize("contract-root-v1");

        await expect(
            passedContractRelease(fixture, {
                candidateId: "contract-override-v1",
                version: "1.1.0",
                contracts: publicApiContract("^1.0.0"),
            }),
        ).rejects.toThrow(/identifiers conflict with inherited/u);

        const secondMajor = await passedContractRelease(fixture, {
            candidateId: "contract-root-v2",
            version: "2.0.0",
            contracts: publicApiContract("^2.0.0"),
        });
        await releaseFinalizer(fixture, secondMajor.store, secondMajor.policy).finalize("contract-root-v2");

        const catalog = verificationContractCatalog(fixture);
        expect((await catalog.listActive("demo", "1.9.0"))[0]?.reference.ownerVersion).toBe("1.0.0");
        expect((await catalog.listActive("demo", "2.1.0"))[0]?.reference.ownerVersion).toBe("2.0.0");
    });

    test("fails closed when the immutable owner verification bundle is substituted", async () => {
        const fixture = registryFixture();
        const release = await passedContractRelease(fixture, {
            candidateId: "contract-corruption",
            version: "1.0.0",
            contracts: publicApiContract("^1.0.0"),
        });
        await releaseFinalizer(fixture, release.store, release.policy).finalize("contract-corruption");
        const digest = release.candidate.verificationDigest;
        const path = join(
            fixture.root,
            ".registry",
            "verification-bundles",
            "objects",
            "sha256",
            shard(digest[0]!),
            shard(digest[1]!),
            `${digest}.json`,
        );
        await chmod(path, 0o640);
        await writeFile(path, "{}", "utf8");

        await expect(verificationContractCatalog(fixture).listActive("demo", "1.1.0")).rejects.toThrow();
    });
});

function shard(character: string): string {
    const value = Number.parseInt(character, 16);
    return value < 4 ? "0-3" : value < 8 ? "4-7" : value < 12 ? "8-b" : "c-f";
}
