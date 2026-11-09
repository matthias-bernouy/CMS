import { expect, test } from "bun:test";
import { MemorySiteUpgradeStorage, withSiteWriteFence } from "@bernouy/repository/upgrades";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { mountContentForTest } from "./content/mount";

test("configuration writes report the site upgrade fence through the declared wire error", async () => {
    const fence = new MemorySiteUpgradeStorage();
    let written = false;
    const store = withSiteWriteFence(
        {
            update: async () => {
                written = true;
            },
        },
        fence,
        "site",
        ["update"],
    );
    await fence.claimMaintenance("site", "upgrade:one");
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await mountContentForTest(dispatcher, { repo: { updateSystem: () => store.update() } as never });
    await expect(
        dispatcher.invoke(
            "ulvia/cms.content",
            "site.update",
            { expectedRevision: 0, name: "changed" },
            {
                requestId: crypto.randomUUID(),
                contractVersion: "1.1.0",
                siteId: "default",
                providerId: "ulvia/primary-provider",
            },
        ),
    ).rejects.toMatchObject({
        code: "UPGRADE_IN_PROGRESS",
        status: 423,
    });
    expect(written).toBe(false);
});
