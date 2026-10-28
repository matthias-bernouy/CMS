import { expect, test } from "bun:test";
import { PageReferencedError } from "@bernouy/cms-content";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { registerContentCapabilities } from "@bernouy/ulvia-provider/capabilities";

test("Page deletion maps incoming links to the declared PAGE_REFERENCED conflict", async () => {
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    registerContentCapabilities(dispatcher, {
        repo: {
            getPageById: async () => ({ id: "target" }),
            deletePage: async () => {
                throw new PageReferencedError("target");
            },
        },
    } as never);
    await expect(
        dispatcher.invoke(
            "ulvia.cms.content",
            "pages.delete",
            { id: "target", expectedRevision: 1 },
            {
                requestId: "test",
                contractVersion: "1.0.0",
                siteId: "default",
                providerId: "test",
            },
        ),
    ).rejects.toMatchObject({ code: "PAGE_REFERENCED", status: 409 });
});
