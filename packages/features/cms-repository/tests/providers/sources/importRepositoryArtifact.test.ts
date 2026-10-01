import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import {
    importRepositoryArtifact,
    importProviderManifest,
    type ProviderRepositorySource,
    type RepositoryArtifactEntry,
    type RepositoryArtifactKind,
    type RepositoryArtifactReference,
} from "@bernouy/cms-repository/providers/sources";
import { describe, expect, test } from "bun:test";
import { contractDocument, implementation, manifestDocument } from "../support/fixtures";

const encoder = new TextEncoder();

describe("repository provider imports", () => {
    test("imports exact implemented contracts before admitting a provider", async () => {
        const fixture = await providerFixture(true);
        const contracts = new InMemoryReleaseCatalogue();
        const manifests = new InMemoryProviderManifestCatalogue(contracts);

        const result = await importRepositoryArtifact(fixture.source, fixture.reference, contracts, manifests);

        expect(result).toEqual({
            kind: "provider-manifest",
            id: "ulvia.example",
            version: "1.0.0",
            digest: fixture.reference.digest,
        });
        expect((await contracts.get("catalog.items", "1.0.0"))?.admission.digest).toBe(fixture.contractDigest);
        expect((await manifests.get("ulvia.example", "1.0.0"))?.admission.digest).toBe(fixture.reference.digest);
    });

    test("rejects an unlisted implemented contract before publishing anything", async () => {
        const fixture = await providerFixture(false);
        const contracts = new InMemoryReleaseCatalogue();
        const manifests = new InMemoryProviderManifestCatalogue(contracts);

        await expect(importRepositoryArtifact(fixture.source, fixture.reference, contracts, manifests)).rejects.toThrow(
            "implemented contract is not listed by this repository",
        );
        expect(await contracts.list()).toEqual([]);
        expect(await manifests.list()).toEqual([]);
    });

    test("imports an administrator-supplied manifest and resolves its contracts from configured repositories", async () => {
        const fixture = await providerFixture(true);
        const contracts = new InMemoryReleaseCatalogue();
        const manifests = new InMemoryProviderManifestCatalogue(contracts);

        const result = await importProviderManifest(
            fixture.provider.canonicalJson,
            [fixture.source],
            contracts,
            manifests,
        );

        expect(result).toMatchObject({
            kind: "provider-manifest",
            id: "ulvia.example",
            publisherId: "ulvia.official",
            version: "1.0.0",
        });
        expect((await contracts.get("catalog.items", "1.0.0"))?.admission.digest).toBe(fixture.contractDigest);
        expect((await manifests.get("ulvia.example", "1.0.0"))?.admission.digest).toBe(fixture.provider.digest);
    });
});

async function providerFixture(includeContract: boolean) {
    const contract = await admitContractRelease(contractDocument("catalog.items", "list"));
    const sourceContracts = new InMemoryReleaseCatalogue();
    await sourceContracts.publish(contract);
    const provider = await admitProviderManifest(
        manifestDocument([implementation("catalog.items", "1.0.0", contract.digest)]),
        sourceContracts,
    );
    const contractEntry = entry("contract", "catalog.items", "1.0.0", contract.digest, "Catalog items");
    const providerEntry = entry(
        "provider-manifest",
        "ulvia.example",
        "1.0.0",
        provider.digest,
        "Ulvia Example Provider",
    );
    const entries = includeContract ? [contractEntry, providerEntry] : [providerEntry];
    const artifacts = new Map([
        [artifactKey(contractEntry), encoder.encode(contract.canonicalJson)],
        [artifactKey(providerEntry), encoder.encode(provider.canonicalJson)],
    ]);
    return {
        source: new FixtureSource(entries, artifacts),
        reference: reference(providerEntry),
        contractDigest: contract.digest,
        provider,
    };
}

class FixtureSource implements ProviderRepositorySource {
    readonly id = "local";

    constructor(
        private readonly entries: readonly RepositoryArtifactEntry[],
        private readonly artifacts: ReadonlyMap<string, Uint8Array>,
    ) {}

    async list(kind: RepositoryArtifactKind): Promise<readonly RepositoryArtifactEntry[]> {
        return this.entries.filter((entry) => entry.kind === kind);
    }

    async get(value: RepositoryArtifactReference): Promise<Uint8Array> {
        const artifact = this.artifacts.get(artifactKey(value));
        if (!artifact) {
            throw new Error("Missing fixture artifact");
        }
        return artifact;
    }
}

function entry(
    kind: RepositoryArtifactKind,
    id: string,
    version: string,
    digest: string,
    name: string,
): RepositoryArtifactEntry {
    return { repositoryId: "local", kind, publisherId: "ulvia.official", id, version, digest, name };
}

function reference(entryValue: RepositoryArtifactEntry): RepositoryArtifactReference {
    const { kind, publisherId, id, version, digest } = entryValue;
    return { kind, publisherId, id, version, digest };
}

function artifactKey(value: RepositoryArtifactReference): string {
    return `${value.kind}/${value.publisherId}/${value.id}/${value.version}`;
}
