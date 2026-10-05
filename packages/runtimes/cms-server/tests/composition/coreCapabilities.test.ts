import { describe, expect, test } from "bun:test";
import { InMemoryCmsRepository } from "@bernouy/cms-content";
import type { RouteHandler, Runner } from "@bernouy/http-runner";
import { LOCAL_CORE_CAPABILITY_ROUTE, mountLocalCoreCapabilities } from "../../src/runtime/coreCapabilities";

const token = "local-provider-to-core-token";

describe("local provider Core capability bridge", () => {
    test("authenticates and dispatches the bounded Pages contract", async () => {
        const repository = new InMemoryCmsRepository();
        await repository.insertPage("/", "Home");
        const { runner, request } = capturePostRoute();
        mountLocalCoreCapabilities(runner, repository, token);
        const unauthorized = await request({ headers: { "content-type": "application/json" }, body: "{}" });
        expect(unauthorized.status).toBe(401);

        const response = await request({
            headers: { authorization: `Bearer ${token}`, "content-type": "application/json" },
            body: JSON.stringify({ contractId: "ulvia.cms.pages", capabilityId: "list", input: { limit: 10 } }),
        });
        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ items: [{ title: "Home", surface: "delivery" }] });
    });

    test("rejects unknown capabilities and oversized inputs", async () => {
        const { runner, request } = capturePostRoute();
        mountLocalCoreCapabilities(runner, new InMemoryCmsRepository(), token);
        const headers = { authorization: `Bearer ${token}`, "content-type": "application/json" };
        expect(
            (
                await request({
                    headers,
                    body: JSON.stringify({ contractId: "unknown", capabilityId: "list", input: {} }),
                })
            ).status,
        ).toBe(404);
        expect(
            (
                await request({
                    headers,
                    body: JSON.stringify({
                        contractId: "ulvia.cms.pages",
                        capabilityId: "list",
                        input: { x: "a".repeat(9_000) },
                    }),
                })
            ).status,
        ).toBe(413);
    });
});

function capturePostRoute(): { runner: Runner; request: (init: RequestInit) => Promise<Response> } {
    let handler: RouteHandler | undefined;
    const runner = {
        post(path: string, next: RouteHandler) {
            expect(path).toBe(LOCAL_CORE_CAPABILITY_ROUTE);
            handler = next;
        },
    } as unknown as Runner;
    return {
        runner,
        request: async (init) => {
            if (!handler) {
                throw new Error("Core capability route was not mounted.");
            }
            return handler(new Request(`http://localhost${LOCAL_CORE_CAPABILITY_ROUTE}`, { method: "POST", ...init }));
        },
    };
}
