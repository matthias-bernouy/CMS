import { expect, test } from "bun:test";
import { createCapabilityHttpHandler } from "@bernouy/cms-gateway/http/handlers";
import { inventoryFixture } from "../../fixtures/inventory";
import { capabilityRequest } from "./http";
import { providerRequest } from "./provider";
import { observeHttp } from "../clients/http";

test("inherited HTTP measurement traverses the declaring contract admission without inventing a child route", async () => {
    const { inventory, build } = await inventoryFixture();
    const target = inventory.targets.find((row) => row.definition.id === "inherited")!;
    const invoked: string[] = [];
    const handler = createCapabilityHttpHandler({
        siteId: "fixture",
        basePath: "/",
        resolveActor: async () => ({ kind: "anonymous" }),
        invoker: {
            resolveContract: async ({ contractId }) => {
                const admission = build.contracts.find((row) => row.release.contractId === contractId);
                if (!admission) {
                    throw new Error("Missing fixture admission");
                }
                return admission;
            },
            invoke: async (value) => {
                invoked.push(`${value.contractId}:${value.capabilityId}`);
                return { requestId: crypto.randomUUID(), kind: "success", output: { ok: true } };
            },
        },
    });
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: handler });
    try {
        const request = capabilityRequest(server.url.origin, target, "http", {});
        expect(request.url.pathname).toBe("/.cms/call/performance/parent/inherited");
        const result = await observeHttp({
            origin: server.url.origin,
            target,
            binding: "http",
            input: {},
            credentials: {},
            assert: (output) => expect(output).toEqual({ ok: true }),
        });
        expect(result.validated && result.completed && result.streamConsumed).toBe(true);
        expect(invoked).toEqual(["performance/parent:inherited"]);
        const wrong = await fetch(`${server.url.origin}/.cms/call/performance/child/inherited`);
        expect(wrong.status).toBe(404);
        await wrong.arrayBuffer();
        expect(invoked).toHaveLength(1);
        expect(target.key).toContain("performance/child@");
        const native = providerRequest(
            server.url.origin,
            target,
            "http",
            {},
            { token: "fixture-only" },
            crypto.randomUUID(),
        );
        expect(native.url.pathname).toBe("/inherited");
        expect(native.init.headers.get("x-ulvia-contract-id")).toBe("performance/child");
    } finally {
        await server.stop(true);
    }
});
