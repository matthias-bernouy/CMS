import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { InMemoryReleaseCatalogue } from "@bernouy/repository/contracts/catalogue";
import { InMemoryProviderManifestCatalogue } from "@bernouy/repository/providers/catalogue";
import { HttpProviderRepository } from "@bernouy/repository/providers/http";
import { importRepositoryArtifact } from "@bernouy/repository/providers/sources";
import { runCli } from "../../src/cli";
import { LocalArtifactFiles, LocalContractReleases } from "@bernouy/repository/repository/filesystem";
import { startTestRepository } from "../repository/fixture";
import { writeAuthoredContractFixture } from "../authoredContractFixture";

test("contract and provider releases use explicit kinds and exact local contract references", async () => {
    const data = await mkdtemp(join(tmpdir(), "ulvia-artifacts-"));
    const contractFolder = join(data, "sources", "protocol.examples");
    const bundleFolder = join(data, "sources", "communication.receipt");
    const providerFolder = join(data, "sources", "ulvia/ulvia.example");
    const contracts = new LocalContractReleases(new LocalArtifactFiles(join(data, "repository")));
    const options = { environment: { ULVIA_DATA_DIR: data }, log: () => undefined };
    try {
        await mkdir(contractFolder, { recursive: true });
        await mkdir(bundleFolder, { recursive: true });
        await mkdir(providerFolder, { recursive: true });
        const fixture = resolve(
            import.meta.dir,
            "../../../../platform/contracts/fixtures/protocol-v1/representative.contract.json",
        );
        const contract = JSON.parse(await readFile(fixture, "utf8")) as Record<string, unknown>;
        contract.catalogue = { icon: "mail", categories: ["communication"] };
        await writeAuthoredContractFixture(contractFolder, contract);
        const providerFixture = resolve(
            import.meta.dir,
            "../../../../platform/providers/fixtures/protocol-v1/example.provider-manifest.json",
        );
        const provider = JSON.parse(await readFile(providerFixture, "utf8")) as Record<string, unknown>;
        const implementation = (provider.implementations as Record<string, unknown>[])[0]!;
        implementation.requires = [];
        await writeFile(join(providerFolder, "definition.json"), JSON.stringify(provider));
        await expect(runCli(["release", providerFolder], options)).rejects.toThrow(
            /do not resolve|resolve to one catalogue/,
        );
        await runCli(["release", contractFolder], options);
        const bundleFixture = resolve(
            import.meta.dir,
            "../../../../platform/contracts/fixtures/protocol-v1/mock.contract.json",
        );
        await writeAuthoredContractFixture(bundleFolder, await readFile(bundleFixture));
        await expect(runCli(["release", bundleFolder], options)).rejects.toThrow();
        await mkdir(join(bundleFolder, "fixtures"));
        const assetFixture = resolve(
            import.meta.dir,
            "../../../../platform/contracts/fixtures/protocol-v1/mock-assets/receipt.svg",
        );
        await writeFile(join(bundleFolder, "fixtures", "receipt.svg"), await readFile(assetFixture));
        await runCli(["release", bundleFolder], options);
        expect(
            (await (await contracts.catalogue()).get("ulvia/communication.receipt", "0.1.0"))?.admission.release
                .fixtureAssets,
        ).toHaveLength(1);
        const published = await (await contracts.catalogue()).get("ulvia/protocol.examples", "1.0.0");
        expect(published).not.toBeNull();
        implementation.digest = published!.admission.digest;
        await writeFile(join(providerFolder, "definition.json"), JSON.stringify(provider));
        await runCli(["release", providerFolder], options);
        await runCli(["release", providerFolder], options);
        expect(await new LocalArtifactFiles(join(data, "repository")).list("providers")).toHaveLength(1);
        const server = startTestRepository(join(data, "repository"));
        try {
            const remote = new HttpProviderRepository("local", server.url);
            const importedContracts = new InMemoryReleaseCatalogue();
            const importedProviders = new InMemoryProviderManifestCatalogue(importedContracts);
            const listedContracts = await remote.list("contract");
            const listedProviders = await remote.list("provider-manifest");
            expect(listedContracts).toHaveLength(2);
            expect(listedProviders).toHaveLength(1);
            const contractReference = listedContracts.find((item) => item.id === "ulvia/protocol.examples")!;
            expect(contractReference.icon).toBe("mail");
            expect(contractReference.categories).toEqual(["communication"]);
            expect(contractReference.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            const providerReference = listedProviders[0]!;
            await importRepositoryArtifact(remote, providerReference, importedContracts, importedProviders);
            expect((await importedContracts.get("ulvia/protocol.examples", "1.0.0"))?.admission.digest).toBe(
                contractReference.digest,
            );
            await expect(
                importRepositoryArtifact(
                    remote,
                    { ...contractReference, digest: `sha256:${"0".repeat(64)}` },
                    importedContracts,
                    importedProviders,
                ),
            ).rejects.toThrow(/not listed/);
            await importRepositoryArtifact(remote, providerReference, importedContracts, importedProviders);
            expect((await importedContracts.list()).length).toBe(1);
            expect((await importedProviders.list()).length).toBe(1);
            const catalogue = (kind: string) =>
                fetch(`${server.url}/.cms/call/ulvia/repository/v1/catalogue`, {
                    method: "QUERY",
                    headers: { "content-type": "application/json" },
                    body: JSON.stringify({ kind, limit: 256 }),
                });
            const contractsIndex = (await (await catalogue("contract")).json()) as {
                releases: unknown[];
            };
            const providersIndex = (await (await catalogue("provider-manifest")).json()) as {
                releases: unknown[];
            };
            expect(contractsIndex.releases).toHaveLength(2);
            expect(providersIndex.releases).toHaveLength(1);
            const fixtureResponse = await fetch(
                `${server.url}/.cms/call/ulvia/repository/v1/assets/contract/ulvia/ulvia%2Fcommunication.receipt/0.1.0/receipt.svg`,
            );
            expect(fixtureResponse.status).toBe(200);
            expect(fixtureResponse.headers.get("content-type")).toBe("application/octet-stream");
            expect(new Uint8Array(await fixtureResponse.arrayBuffer())).toEqual(
                new Uint8Array(await readFile(assetFixture)),
            );
            expect(
                (
                    await fetch(
                        `${server.url}/.cms/call/ulvia/repository/v1/releases/provider-manifest/ulvia/ulvia%2Fulvia.example/1.0.0`,
                    )
                ).headers.get("ETag"),
            ).toMatch(/^"sha256:/);
        } finally {
            await server.stop();
        }
        provider.name = "Different manifest at the same version";
        await writeFile(join(providerFolder, "definition.json"), JSON.stringify(provider));
        await expect(runCli(["release", providerFolder], options)).rejects.toThrow(
            /already published|different content/,
        );
        await runCli(["prune"], options);
        expect(await new LocalArtifactFiles(join(data, "repository")).list("contracts")).toEqual([]);
        expect(await new LocalArtifactFiles(join(data, "repository")).list("providers")).toEqual([]);
    } finally {
        await rm(data, { recursive: true, force: true });
    }
});
