import { expect, test } from "bun:test";
import type { ProviderRepositorySource } from "@bernouy/repository/providers/sources";
import { loadSystemArtifacts } from "../../../src/runtime/instances/system/artifacts";
import { repositoryFixture } from "./fixture";

test("builds the exact system plan from verified repository releases", async () => {
    const fixture = await repositoryFixture();
    const loaded = await loadSystemArtifacts(fixture.providers);

    expect(loaded.plan.manifest.digest).toBe(fixture.manifestDigest);
    expect(loaded.plan.contracts).toEqual(
        loaded.contracts.map(({ release, digest }) => ({
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

test("rejects repository metadata that does not match the official bytes", async () => {
    const fixture = await repositoryFixture();
    const providers: ProviderRepositorySource = {
        ...fixture.providers,
        list: async (kind) =>
            (await fixture.providers.list(kind)).map((entry) =>
                kind === "provider-manifest" ? { ...entry, digest: `sha256:${"0".repeat(64)}` } : entry,
            ),
    };

    await expect(loadSystemArtifacts(providers)).rejects.toThrow("digest mismatch");
});

test("the image contains a complete system plan with Registry available explicitly", async () => {
    const fixture = await repositoryFixture();
    const loaded = await loadSystemArtifacts(fixture.providers);
    expect(loaded.plan.manifest.version).toBe("1.3.0");
    expect(loaded.plan.contracts.some(({ contractId }) => contractId === "ulvia/repository")).toBe(true);
    expect(fixture.contracts).toHaveLength(12);
    const content = loaded.contracts.find(({ release }) => release.contractId === "ulvia/cms.content")!;
    expect(content.capabilities.some(({ definition }) => definition.deprecation)).toBe(false);
    expect(content.capabilities.some(({ definition }) => definition.id === "delivery.resolve-resource")).toBe(true);
    expect(content.capabilities.some(({ definition }) => definition.id === "delivery.resolve-path")).toBe(false);
});
