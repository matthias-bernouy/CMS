import { expect, test } from "bun:test";
import { CoreCapabilityDispatchError, DefaultCoreCapabilityDispatcher } from "@bernouy/cms-content";

test("the Core dispatcher registers feature handlers without transport knowledge", async () => {
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    dispatcher.register("ulvia.cms.settings", "get", async (input) => ({ siteId: input.siteId }));

    await expect(dispatcher.invoke("ulvia.cms.settings", "get", { siteId: "site-a" })).resolves.toEqual({
        siteId: "site-a",
    });
    await expect(dispatcher.invoke("ulvia.cms.settings", "missing", {})).rejects.toEqual(
        expect.objectContaining<Partial<CoreCapabilityDispatchError>>({
            code: "CAPABILITY_NOT_FOUND",
            status: 404,
        }),
    );
});

test("the Core dispatcher rejects duplicate capability ownership", () => {
    const dispatcher = new DefaultCoreCapabilityDispatcher();
    dispatcher.register("ulvia.cms.settings", "get", async () => ({}));

    expect(() => dispatcher.register("ulvia.cms.settings", "get", async () => ({}))).toThrow("already registered");
});
