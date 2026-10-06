import { expect, mock, test } from "bun:test";
import { bootstrapLocalOfficialResources } from "../../src/runtime/gateway/bootstrapLocalOfficialResources";

const pagesDigest = `sha256:${"5".repeat(64)}`;
const collectionDigest = `sha256:${"c".repeat(64)}`;

test("local bootstrap connects, selects, installs, reuses, and upgrades official resources", async () => {
    let installation: Record<string, unknown> | undefined;
    let selected: Record<string, unknown>[] = [];
    let installedDigest: string | undefined;
    const importManifest = mock(async () => ({}));
    const preview = mock(async (input: Record<string, unknown>) => {
        expect(input.version).toBe("0.5.0");
        return { ticket: "bootstrap-ticket" };
    });
    const approve = mock(async () => {
        installation = {
            id: "official-local",
            providerId: "ulvia.official",
            accountId: "local-dev",
            endpoint: "http://127.0.0.1:5103",
            status: "enabled",
            manifestVersion: "0.5.0",
            revision: 1,
            observedAt: "2026-10-06T00:00:00.000Z",
            contracts: [
                {
                    contractId: "ulvia.cms.pages",
                    version: "1.1.0",
                    digest: pagesDigest,
                    status: "ready",
                },
            ],
        };
        return { installationId: "official-local" };
    });
    const selectContract = mock(async (input: Record<string, unknown>) => {
        selected = [{ siteId: "default", ...input }];
        return {};
    });
    const install = mock(async () => {
        installedDigest = collectionDigest;
        return {};
    });
    const upgrade = mock(async () => {
        installedDigest = collectionDigest;
        return {};
    });
    const options = {
        management: {
            importManifest,
            list: async () => ({ installations: installation ? [installation] : [], selected }),
            preview,
            approve,
            selectContract,
        } as never,
        collections: {
            importRelease: async () => ({ digest: collectionDigest, release: {} }),
            snapshot: async () => ({
                revision: installedDigest ? 1 : 0,
                collections: installedDigest ? [{ collectionId: "ulvia-official", digest: installedDigest }] : [],
            }),
            install,
            upgrade,
        } as never,
        repositoryUrl: "http://127.0.0.1:5102",
        providerEndpoint: "http://127.0.0.1:5103",
        providerToken: "opaque-provider-token",
        providerSource: {
            id: "fixture",
            list: async () => [providerEntry("0.4.0"), providerEntry("0.5.0")],
            get: async () => new TextEncoder().encode("{}"),
        },
        collectionSource: {
            id: "fixture",
            list: async () => [
                {
                    repositoryId: "fixture",
                    publisherId: "ulvia.official",
                    collectionId: "ulvia-official",
                    version: "1.1.0",
                    digest: collectionDigest,
                    name: "Ulvia Official",
                    description: "Official Control resources",
                    blocCount: 1,
                    hasTheme: true,
                },
            ],
            get: async () => ({ release: {}, assets: [] }),
        },
    } as const;

    await bootstrapLocalOfficialResources(options);
    await bootstrapLocalOfficialResources(options);
    installedDigest = `sha256:${"a".repeat(64)}`;
    await bootstrapLocalOfficialResources(options);

    expect(importManifest).toHaveBeenCalledTimes(3);
    expect(preview).toHaveBeenCalledTimes(1);
    expect(approve).toHaveBeenCalledTimes(1);
    expect(selectContract).toHaveBeenCalledTimes(1);
    expect(install).toHaveBeenCalledTimes(1);
    expect(upgrade).toHaveBeenCalledTimes(1);
});

function providerEntry(version: string) {
    return {
        repositoryId: "fixture",
        kind: "provider-manifest" as const,
        publisherId: "ulvia.official",
        id: "ulvia.official",
        version,
        digest: `sha256:${(version === "0.5.0" ? "5" : "4").repeat(64)}`,
        name: "Ulvia Official Provider",
    };
}
