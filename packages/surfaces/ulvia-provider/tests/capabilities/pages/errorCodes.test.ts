import { expect, test } from "bun:test";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { mountContentForTest } from "../content/mount";

test("example pagination is invalid input while an invalid Page remains INVALID_PAGE, without writes", async () => {
    let writes = 0;
    let collectionReads = 0;
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await mountContentForTest(dispatcher, {
        repo: {
            insertPage: async () => {
                writes++;
            },
        },
        collections: {
            snapshot: async () => {
                collectionReads++;
                throw new Error("Unexpected collection read");
            },
        },
    } as never);
    const context = {
        requestId: crypto.randomUUID(),
        contractVersion: "1.1.0",
        siteId: "default",
        providerId: "ulvia/primary-provider",
    };
    await expect(
        dispatcher.invoke(
            "ulvia/cms.content",
            "examples.list",
            {
                collectionId: "example/demo",
                locale: "en",
                cursor: "invalid",
            },
            context,
        ),
    ).rejects.toMatchObject({ code: "INVALID_INPUT", status: 422 });
    await expect(
        dispatcher.invoke(
            "ulvia/cms.content",
            "pages.create",
            {
                path: "/draft",
                title: "   ",
            },
            context,
        ),
    ).rejects.toMatchObject({ code: "INVALID_PAGE", status: 422 });
    expect(writes).toBe(0);
    expect(collectionReads).toBe(0);
});
