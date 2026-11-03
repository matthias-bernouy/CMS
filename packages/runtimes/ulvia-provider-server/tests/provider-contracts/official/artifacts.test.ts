import { admitProviderManifest, verifyStoredProviderManifestJson } from "@bernouy/cms-repository/providers";
import { expect, test } from "bun:test";
import type { ProviderRepositorySource } from "@bernouy/cms-repository/providers/sources";
import { loadOfficialArtifacts } from "../../../src/runtime/instances/profiles/artifacts";
import { repositoryFixture } from "./fixture";

test("builds the official profile from verified repository releases", async () => {
    const fixture = await repositoryFixture();
    const loaded = await loadOfficialArtifacts(fixture.providers, fixture.collections);

    expect(loaded.profiles).toEqual([loaded.defaultProfile]);
    expect(loaded.defaultProfile.version).toBe("1.1.0");
    expect(loaded.defaultProfile.manifest.digest).toBe(fixture.manifestDigest);
    expect(loaded.defaultProfile.collection.digest).toBe(fixture.collectionDigest);
    expect(loaded.defaultProfile.contracts).toEqual(
        loaded.contracts.map(({ release, digest }) => ({
            contractId: release.contractId,
            version: release.version,
            digest,
        })),
    );
    const smtp = loaded.contracts.find(({ release }) => release.contractId === "ulvia.cms.emailer.smtp")!;
    expect(smtp.release.capabilities.some(({ id }) => id === "emailer.send")).toBe(false);
    expect(smtp.capabilities.find(({ definition }) => definition.id === "emailer.send")?.owner.contractId).toBe(
        "ulvia.cms.emailer",
    );
    expect(smtp.digest).toBe(fixture.contractDigests.get(smtp.release.contractId));
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

test("the official baseline contains one profile and one version of every contract", async () => {
    const fixture = await repositoryFixture();
    const loaded = await loadOfficialArtifacts(fixture.providers, fixture.collections);
    expect(loaded.profiles.map(({ version }) => version)).toEqual(["1.1.0"]);
    expect(loaded.defaultProfile.upgradeFromVersions).toEqual([]);
    expect(loaded.defaultProfile.manifest.version).toBe("1.0.1");
    expect(loaded.defaultProfile.collection.version).toBe("1.0.0");
    expect(fixture.contracts).toHaveLength(11);
    expect(
        fixture.contracts.every(
            ({ release }) => release.version === (release.contractId === "ulvia.cms.installations" ? "1.1.0" : "1.0.0"),
        ),
    ).toBe(true);
    const content = loaded.contracts.find(({ release }) => release.contractId === "ulvia.cms.content")!;
    expect(content.capabilities.some(({ definition }) => definition.deprecation)).toBe(false);
    expect(content.capabilities.some(({ definition }) => definition.id === "delivery.resolve-resource")).toBe(true);
    expect(content.capabilities.some(({ definition }) => definition.id === "delivery.resolve-path")).toBe(false);
});

test("retains the previous profile when its exact manifest is still present", async () => {
    const fixture = await repositoryFixture();
    const entries = await fixture.providers.list("provider-manifest");
    const current = entries[0]!;
    const manifest = await verifyStoredProviderManifestJson(
        await fixture.providers.get(current),
        current.digest as `sha256:${string}`,
    );
    const previous = await admitProviderManifest({ ...manifest.manifest, version: "1.0.0" }, fixture.catalogue);
    const previousEntry = { ...current, version: "1.0.0", digest: previous.digest };
    const source: ProviderRepositorySource = {
        ...fixture.providers,
        list: async (kind) =>
            kind === "provider-manifest" ? [previousEntry, ...entries] : fixture.providers.list(kind),
        get: async (reference) =>
            reference.kind === "provider-manifest" && reference.version === "1.0.0"
                ? new TextEncoder().encode(previous.canonicalJson)
                : fixture.providers.get(reference),
    };
    const loaded = await loadOfficialArtifacts(source, fixture.collections);
    expect(loaded.defaultProfile.version).toBe("1.1.0");
    expect(loaded.profiles.map(({ version }) => version)).toEqual(["1.0.0", "1.1.0"]);
    expect(loaded.profiles[0]?.manifest).toMatchObject({ version: "1.0.0", digest: previous.digest });
});
