import { expect, test } from "bun:test";
import type { ProviderRepositorySource } from "@bernouy/cms-repository/providers/sources";
import { loadOfficialArtifacts } from "../../../src/runtime/instances/profiles/artifacts";
import { repositoryFixture } from "./fixture";

test("builds the official profile from verified repository releases", async () => {
    const fixture = await repositoryFixture();
    const loaded = await loadOfficialArtifacts(fixture.providers, fixture.collections);

    expect(loaded.profiles.map(({ id }) => id)).toEqual(["ulvia", "repository"]);
    expect(loaded.defaultProfile.contracts.some(({ contractId }) => contractId === "ulvia/repository")).toBe(false);
    expect(loaded.profiles[1]!.contracts.some(({ contractId }) => contractId === "ulvia/repository")).toBe(true);
    expect(loaded.profiles[1]!.collections.map(({ collectionId }) => collectionId)).toEqual([
        "ulvia/mossa",
        "ulvia/repository",
    ]);
    expect(loaded.defaultProfile.collections).toHaveLength(1);
    expect(loaded.defaultProfile.version).toBe("1.0.0");
    expect(loaded.defaultProfile.manifest.digest).toBe(fixture.manifestDigest);
    expect(loaded.defaultProfile.collections[0]!.digest).toBe(fixture.collectionDigest);
    expect(loaded.defaultProfile.contracts).toEqual(
        loaded.contracts
            .filter(({ release }) => release.contractId !== "ulvia/repository")
            .map(({ release, digest }) => ({
                contractId: release.contractId,
                version: release.version,
                digest,
            })),
    );
    const smtp = loaded.contracts.find(({ release }) => release.contractId === "ulvia/cms.emailer.smtp")!;
    expect(smtp.release.capabilities.some(({ id }) => id === "emailer.send")).toBe(false);
    expect(smtp.capabilities.find(({ definition }) => definition.id === "emailer.send")?.owner.contractId).toBe(
        "ulvia/cms.emailer",
    );
    expect(smtp.digest).toBe(fixture.contractDigests.get(smtp.release.contractId));
});

test("a missing application collection prevents startup instead of falling back to the public Repository", async () => {
    const fixture = await repositoryFixture();
    const collections = {
        ...fixture.collections,
        list: async () =>
            (await fixture.collections.list()).filter(({ collectionId }) => collectionId !== "ulvia/repository"),
    };
    await expect(loadOfficialArtifacts(fixture.providers, collections)).rejects.toThrow("ulvia/repository@1.0.0");
});

test("rejects repository metadata that does not match the official bytes", async () => {
    const fixture = await repositoryFixture();
    const providers: ProviderRepositorySource = {
        ...fixture.providers,
        list: async (kind) =>
            (await fixture.providers.list(kind)).map((entry) =>
                kind === "provider-manifest" ? { ...entry, digest: `sha256:${"0".repeat(64)}` } : entry,
            ),
    };

    await expect(loadOfficialArtifacts(providers, fixture.collections)).rejects.toThrow("digest mismatch");
});

test("the official baseline contains explicit application profiles and one version of every contract", async () => {
    const fixture = await repositoryFixture();
    const loaded = await loadOfficialArtifacts(fixture.providers, fixture.collections);
    expect(loaded.profiles.map(({ version }) => version)).toEqual(["1.0.0", "1.0.0"]);
    expect(loaded.defaultProfile.upgradeFromVersions).toEqual([]);
    expect(loaded.defaultProfile.manifest.version).toBe("1.0.0");
    expect(loaded.defaultProfile.collections[0]!.version).toBe("1.0.0");
    expect(fixture.contracts).toHaveLength(12);
    expect(fixture.contracts.every(({ release }) => release.version === "1.0.0")).toBe(true);
    const content = loaded.contracts.find(({ release }) => release.contractId === "ulvia/cms.content")!;
    expect(content.capabilities.some(({ definition }) => definition.deprecation)).toBe(false);
    expect(content.capabilities.some(({ definition }) => definition.id === "delivery.resolve-resource")).toBe(true);
    expect(content.capabilities.some(({ definition }) => definition.id === "delivery.resolve-path")).toBe(false);
});
