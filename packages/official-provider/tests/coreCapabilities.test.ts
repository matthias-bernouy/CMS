import { describe, expect, test } from "bun:test";
import { HttpOfficialCoreCapabilities, OfficialCoreCapabilityError } from "@bernouy/ulvia-official-provider";

const context = {
    requestId: "00000000-0000-4000-8000-000000000001",
    siteId: "default",
    installationId: "official",
    origin: "control" as const,
    actorKind: "administrator" as const,
};

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
                    context,
                    input: { limit: 10 },
                });
                return Response.json({ items: [] });
            }) as typeof fetch,
        );
        expect(await client.invoke("ulvia.cms.pages", "list", { limit: 10 }, context)).toEqual({ items: [] });
    });

    test("refuses non-loopback Core endpoints", () => {
        expect(
            () => new HttpOfficialCoreCapabilities("https://core.example.com/call", "core-provider-secret-token"),
        ).toThrow(/loopback/);
    });

    test("preserves bounded declared Core errors", async () => {
        const client = new HttpOfficialCoreCapabilities(
            "http://127.0.0.1:5100/.cms/internal/core-call",
            "core-provider-secret-token",
            (async () => Response.json({ error: { code: "REVISION_CONFLICT" } }, { status: 409 })) as typeof fetch,
        );

        await expect(client.invoke("ulvia.cms.pages", "rename", {}, context)).rejects.toEqual(
            new OfficialCoreCapabilityError("REVISION_CONFLICT", 409),
        );
    });
});
