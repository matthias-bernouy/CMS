import { expect, test } from "bun:test";
import { mkdir, mkdtemp, readFile, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import { HttpProviderRepository } from "@bernouy/cms-repository/providers/http";
import { importRepositoryArtifact } from "@bernouy/cms-repository/providers/sources";
import { runCli } from "../../src/cli";
import { LocalArtifactFiles } from "../../src/repository/artifactFiles";
import { LocalContractReleases } from "../../src/repository/contracts";
import { startLocalRepository } from "../../src/runtime/repository";

test("contract and provider releases use explicit kinds and exact local contract references", async () => {
    const data = await mkdtemp(join(tmpdir(), "ulvia-artifacts-"));
    const contractFolder = join(data, "sources", "protocol.examples");
    const bundleFolder = join(data, "sources", "communication.receipt");
    const providerFolder = join(data, "sources", "ulvia.example");
    const contracts = new LocalContractReleases(new LocalArtifactFiles(join(data, "repository")));
    const options = { environment: { ULVIA_DATA_DIR: data }, log: () => undefined };
    try {
        await mkdir(contractFolder, { recursive: true });
        await mkdir(bundleFolder, { recursive: true });
        await mkdir(providerFolder, { recursive: true });
        const fixture = resolve(
            import.meta.dir,
            "../../../../features/cms-repository/fixtures/contracts/protocol-v1/representative.contract.json",
        );
        const contract = JSON.parse(await readFile(fixture, "utf8")) as Record<string, unknown>;
        contract.catalogue = { icon: "mail", categories: ["communication"] };
        await writeFile(join(contractFolder, "definition.json"), JSON.stringify(contract));
        const providerFixture = resolve(
            import.meta.dir,
            "../../../../features/cms-repository/fixtures/providers/protocol-v1/example.provider-manifest.json",
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
            "../../../../features/cms-repository/fixtures/contracts/protocol-v1/mock.contract.json",
        );
        await writeFile(join(bundleFolder, "definition.json"), await readFile(bundleFixture));
        await expect(runCli(["release", bundleFolder], options)).rejects.toThrow();
        await mkdir(join(bundleFolder, "fixtures"));
        const assetFixture = resolve(
            import.meta.dir,
            "../../../../features/cms-repository/fixtures/contracts/protocol-v1/mock-assets/receipt.svg",
        );
        await writeFile(join(bundleFolder, "fixtures", "receipt.svg"), await readFile(assetFixture));
        await runCli(["release", bundleFolder], options);
        expect(
            (await (await contracts.catalogue()).get("communication.receipt", "0.1.0"))?.admission.fixtureAssets,
        ).toHaveLength(1);
        const published = await (await contracts.catalogue()).get("protocol.examples", "1.0.0");
        expect(published).not.toBeNull();
        implementation.digest = published!.admission.digest;
        await writeFile(join(providerFolder, "definition.json"), JSON.stringify(provider));
        await runCli(["release", providerFolder], options);
        await runCli(["release", providerFolder], options);
        expect(await new LocalArtifactFiles(join(data, "repository")).list("providers")).toHaveLength(1);
        const server = startLocalRepository(0, join(data, "repository"));
        try {
            const remote = new HttpProviderRepository("local", server.url);
            const importedContracts = new InMemoryReleaseCatalogue();
            const importedProviders = new InMemoryProviderManifestCatalogue(importedContracts);
            const listedContracts = await remote.list("contract");
            const listedProviders = await remote.list("provider-manifest");
            expect(listedContracts).toHaveLength(2);
            expect(listedProviders).toHaveLength(1);
            const contractReference = listedContracts.find((item) => item.id === "protocol.examples")!;
            expect(contractReference.icon).toBe("mail");
            expect(contractReference.categories).toEqual(["communication"]);
            expect(contractReference.publishedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);
            const providerReference = listedProviders[0]!;
            await expect(
                importRepositoryArtifact(remote, providerReference, importedContracts, importedProviders),
            ).rejects.toThrow();
            await expect(
                importRepositoryArtifact(
                    remote,
                    { ...contractReference, digest: `sha256:${"0".repeat(64)}` },
                    importedContracts,
                    importedProviders,
                ),
            ).rejects.toThrow(/not listed/);
            await importRepositoryArtifact(remote, contractReference, importedContracts, importedProviders);
            await importRepositoryArtifact(remote, providerReference, importedContracts, importedProviders);
            expect((await importedContracts.list()).length).toBe(1);
            expect((await importedProviders.list()).length).toBe(1);
            const contractsIndex = (await (await fetch(`${server.url}/v1/contracts`)).json()) as {
                releases: unknown[];
            };
            const providersIndex = (await (await fetch(`${server.url}/v1/providers`)).json()) as {
                releases: unknown[];
            };
            expect(contractsIndex.releases).toHaveLength(2);
            expect(providersIndex.releases).toHaveLength(1);
            const fixtureResponse = await fetch(
                `${server.url}/v1/contracts/ulvia.official/communication.receipt/0.1.0/fixtures/receipt.svg`,
            );
            expect(fixtureResponse.status).toBe(200);
            expect(fixtureResponse.headers.get("content-type")).toBe("image/svg+xml");
            expect(new Uint8Array(await fixtureResponse.arrayBuffer())).toEqual(
                new Uint8Array(await readFile(assetFixture)),
            );
            expect(
                (await fetch(`${server.url}/v1/providers/ulvia.official/ulvia.example/1.0.0`)).headers.get("ETag"),
            ).toMatch(/^"sha256:/);
        } finally {
            server.stop();
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
