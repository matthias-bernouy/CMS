import { expect, test } from "bun:test";
import { admitContractRelease } from "@bernouy/cms-repository/contracts";
import { InMemoryReleaseCatalogue, publishContractSet } from "@bernouy/cms-repository/contracts/catalogue";
import { admitProviderManifest } from "@bernouy/cms-repository/providers";
import { InMemoryProviderManifestCatalogue } from "@bernouy/cms-repository/providers/catalogue";
import {
    importRepositoryArtifact,
    type ProviderRepositorySource,
    type RepositoryArtifactEntry,
    type RepositoryArtifactReference,
} from "@bernouy/cms-repository/providers/sources";
import { contractDocument, implementation, manifestDocument, requirement } from "../support/fixtures";

test("imports exact contract ancestors needed by provider requirements", async () => {
    const parent = await admitContractRelease(contractDocument("communication.email", "email.send"));
    const childDocument = contractDocument("communication.smtp", "smtp.configure");
    childDocument.extends = {
        contractId: parent.release.contractId,
        version: parent.release.version,
        digest: parent.digest,
    };
    const child = await admitContractRelease(childDocument);
    const consumerDocument = contractDocument("identity.access", "access.login");
    const consumer = await admitContractRelease(consumerDocument);
    const sourceContracts = new InMemoryReleaseCatalogue();
    await publishContractSet(sourceContracts, [parent, child, consumer]);
    const provider = await admitProviderManifest(
        manifestDocument([
            implementation(child.release.contractId, child.release.version, child.digest),
            implementation(consumer.release.contractId, consumer.release.version, consumer.digest, [
                requirement("communication.email", "email.send"),
            ]),
        ]),
        sourceContracts,
    );
    const artifacts = [parent, child, consumer].map((admission) => contractEntry(admission));
    const providerEntry: RepositoryArtifactEntry = {
        repositoryId: "local",

        kind: "provider-manifest",
        publisherId: provider.manifest.provenance.publisherId,
        id: provider.manifest.providerId,
        version: provider.manifest.version,
        digest: provider.digest,
        name: provider.manifest.name,
    };
    const source = new LineageSource(
        [...artifacts.map(({ entry }) => entry), providerEntry],
        new Map([
            ...artifacts.map(({ entry, bytes }) => [key(entry), bytes] as const),
            [key(providerEntry), new TextEncoder().encode(provider.canonicalJson)],
        ]),
    );
    const contracts = new InMemoryReleaseCatalogue();
    const manifests = new InMemoryProviderManifestCatalogue(contracts);

    await importRepositoryArtifact(source, reference(providerEntry), contracts, manifests);

    expect((await contracts.get(parent.release.contractId, parent.release.version))?.admission.digest).toBe(
        parent.digest,
    );
    expect((await contracts.get(child.release.contractId, child.release.version))?.admission.digest).toBe(child.digest);
    expect((await manifests.get(provider.manifest.providerId, provider.manifest.version))?.admission.digest).toBe(
        provider.digest,
    );
});

function contractEntry(admission: Awaited<ReturnType<typeof admitContractRelease>>) {
    const entry: RepositoryArtifactEntry = {
        repositoryId: "local",
        kind: "contract",
        publisherId: admission.release.publisherId,
        id: admission.release.contractId,
        version: admission.release.version,
        digest: admission.digest,
        name: admission.release.name,
    };
    return { entry, bytes: new TextEncoder().encode(admission.canonicalJson) };
}

class LineageSource implements ProviderRepositorySource {
    readonly id = "local";

    constructor(
        private readonly entries: readonly RepositoryArtifactEntry[],
        private readonly bytes: ReadonlyMap<string, Uint8Array>,
    ) {}

    async list(kind: RepositoryArtifactEntry["kind"]): Promise<readonly RepositoryArtifactEntry[]> {
        return this.entries.filter((entry) => entry.kind === kind);
    }

    async get(value: RepositoryArtifactReference): Promise<Uint8Array> {
        const bytes = this.bytes.get(key(value));
        if (!bytes) {
            throw new Error("Missing test artifact");
        }
        return bytes;
    }
}

function reference(entry: RepositoryArtifactEntry): RepositoryArtifactReference {
    return {
        kind: entry.kind,
        publisherId: entry.publisherId,
        id: entry.id,
        version: entry.version,
        digest: entry.digest,
    };
}

function key(value: RepositoryArtifactReference): string {
    return `${value.kind}/${value.publisherId}/${value.id}/${value.version}`;
}
