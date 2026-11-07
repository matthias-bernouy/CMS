import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { loadOfficialFeatures, registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";

test("a selected diagnostic implementation refuses missing services without partially mounting its claim", async () => {
    const build = await loadOfficialFeatures();
    const pins = build.implementations.filter(({ contractId }) => contractId === "ulvia/cms.observability");
    expect(pins).toHaveLength(1);
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await expect(
        registerOfficialFeatures(dispatcher, {}, pins, {
            providerId: "ulvia/primary-provider",
            scope: { siteId: "default", instanceId: "instance:test" },
        }),
    ).rejects.toThrow("Observability requires an injected observability service");
    dispatcher.seal([]);
});
