import { expect, test } from "bun:test";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { runCli } from "../../src/cli";
import { LocalArtifactFiles, LocalCollectionRepository } from "@bernouy/cms-repository/repository/filesystem";
import { startTestRepository } from "./fixture";
import { prepareContractSource } from "../../src/release/authored/contract";
import type { AdmittedContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";

test("CLI push and pull preserve every official artifact kind through a remote repository", async () => {
    const sourceData = await mkdtemp(join(tmpdir(), "ulvia-push-source-"));
    const targetData = await mkdtemp(join(tmpdir(), "ulvia-pull-target-"));
    const remoteRoot = await mkdtemp(join(tmpdir(), "ulvia-push-target-"));
    const server = startTestRepository(remoteRoot);
    const repositoryRoot = resolve(import.meta.dir, "../../../../official-repository");
    const providerDirectory = join(repositoryRoot, "providers", "ulvia.official");
    const providerDefinition = (await Bun.file(join(providerDirectory, "definition.json")).json()) as {
        implementations: Array<{ contractId: string }>;
    };
    const contractIds = await publicationOrder(
        repositoryRoot,
        providerDefinition.implementations.map(({ contractId }) => contractId),
    );
    const environment = (data: string) => ({
        ULVIA_DATA_DIR: data,
        ULVIA_REPOSITORY_URL: server.url,
    });
    try {
        await server.connect(sourceData);
        for (const contractId of contractIds) {
            const directory = join(repositoryRoot, "contracts", contractId);
            const definition = (await Bun.file(join(directory, "definition.json")).json()) as { version: string };
            const coordinate = `ulvia.official/${contractId}@${definition.version}`;
            await runCli(["release", directory], { environment: environment(sourceData), log: () => undefined });
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
        const providerCoordinate = `ulvia.official/ulvia.official@${providerVersion}`;
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
        const accessVersion = await definitionVersion(join(repositoryRoot, "contracts", "ulvia.cms.access"));
        const accessCoordinate = `ulvia.official/ulvia.cms.access@${accessVersion}`;
        await runCli(["yank", "contract", accessCoordinate, "--reason", "Temporarily unavailable"], {
            environment: environment(sourceData),
            log: () => undefined,
        });
        expect(
            ((await (await fetch(`${server.url}/v1/providers`)).json()) as { releases: unknown[] }).releases,
        ).toHaveLength(1);
        expect(
            (await fetch(`${server.url}/v1/contracts/ulvia.official/ulvia.cms.access/${accessVersion}`)).status,
        ).toBe(200);
        await runCli(["restore", "contract", accessCoordinate], {
            environment: environment(sourceData),
            log: () => undefined,
        });

        const collectionDirectory = join(repositoryRoot, "collections", "ulvia-official");
        const collectionVersion = await definitionVersion(collectionDirectory);
        const collectionCoordinate = `ulvia.official/ulvia-official@${collectionVersion}`;
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
        expect(
            ((await (await fetch(`${server.url}/v1/collections`)).json()) as { releases: unknown[] }).releases,
        ).toEqual([]);
        await runCli(["restore", "collection", collectionCoordinate], {
            environment: environment(sourceData),
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
}, 30_000);

async function definitionVersion(directory: string): Promise<string> {
    return ((await Bun.file(join(directory, "definition.json")).json()) as { version: string }).version;
}

async function publicationOrder(repositoryRoot: string, contractIds: readonly string[]): Promise<readonly string[]> {
    const admissions = new Map<string, AdmittedContractRelease>();
    const load = async (contractId: string): Promise<AdmittedContractRelease> => {
        const existing = admissions.get(contractId);
        if (existing) {
            return existing;
        }
        const directory = join(repositoryRoot, "contracts", contractId);
        const admission = (await prepareContractSource(directory)).admission;
        admissions.set(contractId, admission);
        if (admission.release.extends) {
            const parent = await load(admission.release.extends.contractId);
            if (
                parent.release.version !== admission.release.extends.version ||
                parent.digest !== admission.release.extends.digest
            ) {
                throw new Error(`Official specialization parent mismatch: ${contractId}`);
            }
        }
        return admission;
    };
    await Promise.all(contractIds.map(load));
    const ordered = await publishContractSet(new InMemoryReleaseCatalogue(), [...admissions.values()]);
    return ordered.map(({ release }) => release.contractId);
}
