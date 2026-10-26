import { expect, test } from "bun:test";
import { MemorySiteUpgradeStorage, withSiteWriteFence } from "@bernouy/cms-repository/upgrades";
import { configurationCommand } from "../../src/capabilities/content/support";

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
    await expect(configurationCommand(() => store.update())).rejects.toMatchObject({
        code: "UPGRADE_IN_PROGRESS",
        status: 423,
    });
    expect(written).toBe(false);
});
