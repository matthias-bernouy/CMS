import { expect, test } from "bun:test";
import type { ControlCms } from "cms-control/ControlCms";
import selectSource from "cms-control/api/_integrations/source-select.post";

test("source selection rejects a disabled provider before importing the release", async () => {
    let imported = false;
    const cms = {
        auth: { getSubject: async () => ({ identifier: "admin" }) },
        config: {
            administrator: async () => true,
            providerResources: {
                isAdministrator: async () => true,
                sources: [
                    {
                        id: "local",
                        get: async () => {
                            imported = true;
                            throw new Error("release should not be imported");
                        },
                    },
                ],
                management: {
                    list: async () => ({
                        installations: [
                            {
                                id: "provider-1",
                                status: "disabled",
                                contracts: [
                                    {
                                        contractId: "catalog.items",
                                        version: "1.0.0",
                                        digest: "sha256:release",
                                        status: "ready",
                                    },
                                ],
                            },
                        ],
                    }),
                },
            },
        },
    } as unknown as ControlCms;
    const request = new Request("http://control.test/api/source-select", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
            repositoryId: "local",
            publisherId: "ulvia.official",
            id: "catalog.items",
            version: "1.0.0",
            digest: "sha256:release",
            installationId: "provider-1",
        }),
    });

    await expect(selectSource(request, cms)).rejects.toThrow("Provider does not report");
    expect(imported).toBeFalse();
});
