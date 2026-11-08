import { resourceName } from "@bernouy/ulvia-contracts/protocol";
import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../src/cli";
import { LocalArtifactFiles, LocalCollectionRepository } from "@bernouy/repository/repository/filesystem";
import { startTestRepository } from "./fixture";
import { compileOfficialFeatures } from "@bernouy/ulvia-provider/build";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/repository/contracts/catalogue";

test("CLI push and pull preserve every official artifact kind through a remote repository", async () => {
    const sourceData = await mkdtemp(join(tmpdir(), "ulvia-push-source-"));
    const targetData = await mkdtemp(join(tmpdir(), "ulvia-pull-target-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ulvia-push-target-"));
    const server = startTestRepository(remoteRoot);
    const repositoryRoot = resolve(import.meta.dir, "../../dist/bootstrap");
    const providerDirectory = join(repositoryRoot, "providers", "primary-provider");
    const contractIds = (
        await publishContractSet(new InMemoryReleaseCatalogue(), (await compileOfficialFeatures()).contracts)
    ).map(({ release }) => release.contractId);
    const environment = (data: string) => ({
        ULVIA_DATA_DIR: data,
        ULVIA_REPOSITORY_URL: server.url,
    });
    const catalogue = async (kind: string) =>
        (await (
            await fetch(`${server.url}/.cms/call/ulvia/repository/v1/catalogue`, {
                method: "QUERY",
                headers: { "content-type": "application/json" },
                body: JSON.stringify({ kind, limit: 256 }),
            })
        ).json()) as { releases: unknown[] };
    try {
        await server.connect(sourceData);
        await server.claim("ulvia.test");
        await runCli(["release", resolve(import.meta.dir, "../../../../../infra/releases")], {
            environment: environment(sourceData),
            log: () => undefined,
        });
        for (const contractId of contractIds) {
            const directory = join(
                repositoryRoot,
                "contracts",
                ...(contractId.startsWith("ulvia/cms.") ? ["cms"] : []),
                resourceName(contractId),
            );
            const definition = (await Bun.file(join(directory, "definition.json")).json()) as { version: string };
            const coordinate = `${contractId}@${definition.version}`;
            await runCli(["push", "contract", coordinate], {
                environment: environment(sourceData),
                log: () => undefined,
            });
            await runCli(["pull", "contract", coordinate], {
                environment: environment(targetData),
                log: () => undefined,
            });
        }

        const providerVersion = await definitionVersion(providerDirectory);
        const providerCoordinate = `ulvia/primary-provider@${providerVersion}`;
        await runCli(["release", providerDirectory], {
            environment: environment(sourceData),
            log: () => undefined,
        });
        await runCli(["push", "provider", providerCoordinate], {
            environment: environment(sourceData),
            log: () => undefined,
        });
        await runCli(["pull", "provider", providerCoordinate], {
            environment: environment(targetData),
            log: () => undefined,
        });
        const accessVersion = await definitionVersion(join(repositoryRoot, "contracts", "cms", "cms.access"));
        const accessCoordinate = `ulvia/cms.access@${accessVersion}`;
        await runCli(["yank", "contract", accessCoordinate, "--reason", "Temporarily unavailable"], {
            environment: environment(sourceData),
            log: () => undefined,
        });
        expect(
            (
                (await (
                    await fetch(`${server.url}/.cms/call/ulvia/repository/v1/catalogue`, {
                        method: "QUERY",
                        headers: { "content-type": "application/json" },
                        body: JSON.stringify({ kind: "provider-manifest", limit: 256 }),
                    })
                ).json()) as { releases: unknown[] }
            ).releases,
        ).toHaveLength(1);
        expect(
            (
                await fetch(
                    `${server.url}/.cms/call/ulvia/repository/v1/releases/contract/ulvia/ulvia%2Fcms.access/${accessVersion}`,
                )
            ).status,
        ).toBe(200);
        await runCli(["restore", "contract", accessCoordinate], {
            environment: environment(sourceData),
            log: () => undefined,
        });

        const collectionDirectory = resolve(import.meta.dir, "../stack/fixtures/smoke-kit");
        const collectionVersion = await definitionVersion(collectionDirectory);
        const collectionCoordinate = `ulvia.test/smoke-kit@${collectionVersion}`;
        await runCli(["release", collectionDirectory], {
            environment: environment(sourceData),
            log: () => undefined,
        });
        await runCli(["push", "collection", collectionCoordinate], {
            environment: environment(sourceData),
            log: () => undefined,
        });
        await runCli(["pull", "collection", collectionCoordinate], {
            environment: environment(targetData),
            log: () => undefined,
        });

        expect(await new LocalArtifactFiles(join(targetData, "repository")).list("contracts")).toHaveLength(
            contractIds.length,
        );
        expect(await new LocalArtifactFiles(join(targetData, "repository")).list("providers")).toHaveLength(1);
        expect(await new LocalCollectionRepository(join(targetData, "repository")).list()).toHaveLength(1);

        await runCli(["yank", "collection", collectionCoordinate, "--reason", "Superseded"], {
            environment: environment(sourceData),
            log: () => undefined,
        });
        expect((await catalogue("collection")).releases).toEqual([]);
        await runCli(["restore", "collection", collectionCoordinate], {
            environment: environment(sourceData),
            log: () => undefined,
        });
        expect((await catalogue("collection")).releases).toHaveLength(1);
    } finally {
        await server.stop();
        await Promise.all(
            [sourceData, targetData, remoteRoot].map((path) => rm(path, { recursive: true, force: true })),
        );
    }
    // Includes explicit authored collection compilation and transfer.
}, 60_000);

async function definitionVersion(directory: string): Promise<string> {
    return ((await Bun.file(join(directory, "definition.json")).json()) as { version: string }).version;
}
