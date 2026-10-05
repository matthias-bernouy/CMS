import { describe, expect, test } from "bun:test";
import { HttpOfficialCoreCapabilities } from "@bernouy/ulvia-official-provider";

describe("HttpOfficialCoreCapabilities", () => {
    test("forwards only a bounded generic call to the selected loopback Core", async () => {
        const client = new HttpOfficialCoreCapabilities(
            "http://127.0.0.1:5100/.cms/internal/core-call",
            "core-provider-secret-token",
            (async (_input, init) => {
                const request = new Request("http://127.0.0.1:5100/.cms/internal/core-call", init);
                expect(request.headers.get("authorization")).toBe("Bearer core-provider-secret-token");
                expect(await request.json()).toEqual({
                    contractId: "ulvia.cms.pages",
                    capabilityId: "list",
                    input: { limit: 10 },
                });
                return Response.json({ items: [] });
            }) as typeof fetch,
        );
        expect(await client.invoke("ulvia.cms.pages", "list", { limit: 10 })).toEqual({ items: [] });
    });

    test("refuses non-loopback Core endpoints", () => {
        expect(
            () => new HttpOfficialCoreCapabilities("https://core.example.com/call", "core-provider-secret-token"),
        ).toThrow(/loopback/);
    });
});
