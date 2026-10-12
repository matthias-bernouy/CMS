import { expect, test } from "bun:test";
import { activateProviderContract } from "@bernouy/cms-repository/providers/management";
import type { ProductionGateway } from "../../src/runtime/gateway/createProductionGateway";

test("source selection pins only the ready exact release and preserves other contracts", async () => {
    let ready = true;
    let selected: unknown[] = [];
    const gateway = {
        siteId: "site",
        installations: {
            get: async () => ({
                installation: {
                    status: "enabled",
                    providerId: "official",
                    approval: { manifestVersion: "1.0.0", manifestDigest: "manifest-digest" },
                },
                observation: {
                    report: {
                        implementations: [
                            {
                                contractId: "catalog.items",
                                version: "0.1.0",
                                digest: "release-digest",
                                status: ready ? "ready" : "unavailable",
                            },
                        ],
                    },
                },
            }),
        },
        manifests: {
            get: async () => ({
                admission: {
                    digest: "manifest-digest",
                    manifest: {
                        implementations: [{ contractId: "catalog.items", version: "0.1.0", digest: "release-digest" }],
                    },
                },
            }),
        },
        releases: { get: async () => ({ admission: { digest: "release-digest" } }) },
        selections: {
            get: async () => ({
                revision: 4,
                plan: {
                    selections: [
                        {
                            siteId: "site",
                            contractId: "media.assets",
                            version: "0.1.0",
                            digest: "other",
                            installationId: "other-installation",
                        },
                    ],
                },
            }),
            replace: async (_siteId: string, next: unknown[]) => {
                selected = next;
                return { revision: 5, plan: { selections: next } };
            },
        },
    } as unknown as ProductionGateway;
    const input = {
        installationId: "provider-installation",
        contractId: "catalog.items",
        version: "0.1.0",
        digest: "release-digest",
    };
    await activateProviderContract(gateway, input);
    expect(selected).toHaveLength(2);
    expect(selected).toContainEqual({ siteId: "site", ...input });
    ready = false;
    await expect(activateProviderContract(gateway, input)).rejects.toThrow(/ready/);
});
