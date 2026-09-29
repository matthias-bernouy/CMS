import { expect, test } from "bun:test";
import { GatewayError } from "@bernouy/cms-gateway";
import { handleGatewayFileGet } from "@bernouy/cms-gateway/media/handlers";

test("file route keeps gateway errors private", async () => {
    const response = await handleGatewayFileGet(
        new Request("https://site.example/.cms/media/files/file.read/photo-1"),
        {
            siteId: "site-a",
            origin: "delivery",
            actor: { kind: "anonymous" },
            prefix: "/.cms/media",
            invoker: {
                invoke: async () => {
                    throw new GatewayError("not_selected", "no provider selected", "request-1");
                },
            },
        },
    );
    expect(response.status).toBe(404);
    expect(response.headers.get("cache-control")).toBe("private, no-store");
    expect(response.headers.get("x-ulvia-request-id")).toBe("request-1");
});
