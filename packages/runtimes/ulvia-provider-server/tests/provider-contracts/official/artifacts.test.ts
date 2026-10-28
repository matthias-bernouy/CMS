import { expect, test } from "bun:test";
import type { ProviderRepositorySource } from "@bernouy/cms-repository/providers/sources";
import { loadOfficialArtifacts } from "../../../src/runtime/instances/profiles/artifacts";
import { repositoryFixture } from "./fixture";

test("builds the official profile from verified repository releases", async () => {
    const fixture = await repositoryFixture();
    const loaded = await loadOfficialArtifacts(fixture.providers, fixture.collections);

    expect(loaded.profiles).toEqual([loaded.defaultProfile]);
    expect(loaded.defaultProfile.version).toBe("1.2.0");
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

test("retains published profile 1.0.0 while upgrading the exact observability selection", async () => {
    const fixture = await repositoryFixture(true);
    const loaded = await loadOfficialArtifacts(fixture.providers, fixture.collections);
    expect(loaded.profiles.map(({ version }) => version)).toEqual(["1.0.0", "1.1.0", "1.2.0"]);
    expect(loaded.defaultProfile.version).toBe("1.2.0");
    expect(loaded.defaultProfile.upgradeFromVersions).toEqual(["1.0.0", "1.1.0"]);
    const previous = loaded.profiles[0]!;
    const current = loaded.defaultProfile;
    expect(previous.manifest.version).toBe("0.1.0");
    expect(previous.contracts.find(({ contractId }) => contractId === "ulvia.cms.observability")).toMatchObject({
        version: "1.0.0",
        digest: "sha256:2cb491b040262a9993e52733ab58437779b529471b4df461bae036863943c498",
    });
    expect(current.manifest.version).toBe("0.3.0");
    expect(current.contracts.find(({ contractId }) => contractId === "ulvia.cms.observability")).toMatchObject({
        version: "1.1.0",
    });
    expect(current.collection).toEqual(previous.collection);
    expect(current.collection.digest).toBe("sha256:7384c6a73f8879f03cc0023193112ce48bf890ae0137f683056e55480dd21bc7");
    expect(
        loaded.contracts
            .filter(({ release }) => release.contractId === "ulvia.cms.observability")
            .map(({ release }) => release.version),
    ).toEqual(["1.0.0", "1.1.0"]);
});
