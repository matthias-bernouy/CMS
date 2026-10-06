import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../src/cli";
import { LocalArtifactFiles, LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { startLocalRepository } from "../../src/runtime/repository";

test("CLI push and pull preserve every official artifact kind through a remote repository", async () => {
    const sourceData = await mkdtemp(join(tmpdir(), "ulvia-push-source-"));
    const targetData = await mkdtemp(join(tmpdir(), "ulvia-pull-target-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ulvia-push-target-"));
    const token = "b".repeat(43);
    const server = startLocalRepository(0, remoteRoot, token);
    const repositoryRoot = resolve(import.meta.dir, "../../../../official-repository");
    const providerDirectory = join(repositoryRoot, "providers", "ulvia.official");
    const providerDefinition = (await Bun.file(join(providerDirectory, "definition.json")).json()) as {
        implementations: Array<{ contractId: string }>;
    };
    const contractIds = providerDefinition.implementations.map(({ contractId }) => contractId);
    const environment = (data: string, writable: boolean) => ({
        ULVIA_DATA_DIR: data,
        ULVIA_REPOSITORY_URL: server.url,
        ...(writable ? { ULVIA_REPOSITORY_TOKEN: token } : {}),
    });
    try {
        for (const contractId of contractIds) {
            const directory = join(repositoryRoot, "contracts", contractId);
            const definition = (await Bun.file(join(directory, "definition.json")).json()) as { version: string };
            const coordinate = `ulvia.official/${contractId}@${definition.version}`;
            await runCli(["release", directory], { environment: environment(sourceData, false), log: () => undefined });
            await runCli(["push", "contract", coordinate], {
                environment: environment(sourceData, true),
                log: () => undefined,
            });
            await runCli(["pull", "contract", coordinate], {
                environment: environment(targetData, false),
                log: () => undefined,
            });
        }

        const providerVersion = await definitionVersion(providerDirectory);
        const providerCoordinate = `ulvia.official/ulvia.official@${providerVersion}`;
        await runCli(["release", providerDirectory], {
            environment: environment(sourceData, false),
            log: () => undefined,
        });
        await runCli(["push", "provider", providerCoordinate], {
            environment: environment(sourceData, true),
            log: () => undefined,
        });
        await runCli(["pull", "provider", providerCoordinate], {
            environment: environment(targetData, false),
            log: () => undefined,
        });
        const jobsVersion = await definitionVersion(join(repositoryRoot, "contracts", "ulvia.cms.jobs"));
        const jobsCoordinate = `ulvia.official/ulvia.cms.jobs@${jobsVersion}`;
        await runCli(["yank", "contract", jobsCoordinate, "--reason", "Temporarily unavailable"], {
            environment: environment(sourceData, true),
            log: () => undefined,
        });
        expect(
            ((await (await fetch(`${server.url}/v1/providers`)).json()) as { releases: unknown[] }).releases,
        ).toHaveLength(1);
        expect((await fetch(`${server.url}/v1/contracts/ulvia.official/ulvia.cms.jobs/${jobsVersion}`)).status).toBe(
            200,
        );
        await runCli(["restore", "contract", jobsCoordinate], {
            environment: environment(sourceData, true),
            log: () => undefined,
        });

        const collectionDirectory = join(repositoryRoot, "collections", "ulvia-official");
        const collectionVersion = await definitionVersion(collectionDirectory);
        const collectionCoordinate = `ulvia.official/ulvia-official@${collectionVersion}`;
        await runCli(["release", collectionDirectory], {
            environment: environment(sourceData, false),
            log: () => undefined,
        });
        await runCli(["push", "collection", collectionCoordinate], {
            environment: environment(sourceData, true),
            log: () => undefined,
        });
        await runCli(["pull", "collection", collectionCoordinate], {
            environment: environment(targetData, false),
            log: () => undefined,
        });

        expect(await new LocalArtifactFiles(join(targetData, "repository")).list("contracts")).toHaveLength(
            contractIds.length,
        );
        expect(await new LocalArtifactFiles(join(targetData, "repository")).list("providers")).toHaveLength(1);
        expect(await new LocalCollectionRepository(join(targetData, "repository")).list()).toHaveLength(1);

        await runCli(["yank", "collection", collectionCoordinate, "--reason", "Superseded"], {
            environment: environment(sourceData, true),
            log: () => undefined,
        });
        expect(
            ((await (await fetch(`${server.url}/v1/collections`)).json()) as { releases: unknown[] }).releases,
        ).toEqual([]);
        await runCli(["restore", "collection", collectionCoordinate], {
            environment: environment(sourceData, true),
            log: () => undefined,
        });
        expect(
            ((await (await fetch(`${server.url}/v1/collections`)).json()) as { releases: unknown[] }).releases,
        ).toHaveLength(1);
    } finally {
        server.stop();
        await Promise.all(
            [sourceData, targetData, remoteRoot].map((path) => rm(path, { recursive: true, force: true })),
        );
    }
});

async function definitionVersion(directory: string): Promise<string> {
    return ((await Bun.file(join(directory, "definition.json")).json()) as { version: string }).version;
}
