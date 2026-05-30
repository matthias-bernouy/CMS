import { describe, test, expect, spyOn } from "bun:test";
import GatewayServer from "cms-delivery/endpoints/gateway.server";
import type DeliveryCms from "cms-delivery/DeliveryCms";
import { InMemoryGatewayRepository, seedProviders } from "@bernouy/cms-gateway";
import { BAN_PROVIDER } from "@bernouy/cms-gateway/presets";

// GatewayServer only reads `delivery.gateway` and `delivery.basePath`, so a
// minimal stand-in avoids constructing a full DeliveryCms (runner, repo, …).
async function deliveryWithBan(): Promise<DeliveryCms> {
    const gateway = new InMemoryGatewayRepository();
    await seedProviders(gateway, [BAN_PROVIDER]);
    return { gateway, cmsPathPrefix: "/.cms" } as unknown as DeliveryCms;
}

describe("GatewayServer (delivery proxy)", () => {
    test("resolves a preset endpoint and forwards to the built upstream URL", async () => {
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(
            new Response('{"type":"FeatureCollection"}', { status: 200, headers: { "content-type": "application/json" } }),
        );
        try {
            const res = await GatewayServer(
                new Request("http://d/.cms/gateway/ban/search?q=8+bd+du+port"),
                await deliveryWithBan(),
            );
            expect(res.status).toBe(200);
            expect(fetchSpy).toHaveBeenCalledTimes(1);
            expect(String(fetchSpy.mock.calls[0]![0])).toBe("https://api-adresse.data.gouv.fr/search/?q=8+bd+du+port");
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("unknown endpoint → 404, no upstream call", async () => {
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("x"));
        try {
            const res = await GatewayServer(new Request("http://d/.cms/gateway/ban/nope"), await deliveryWithBan());
            expect(res.status).toBe(404);
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("wrong method → 405, no upstream call", async () => {
        const fetchSpy = spyOn(globalThis, "fetch").mockResolvedValue(new Response("x"));
        try {
            const res = await GatewayServer(
                new Request("http://d/.cms/gateway/ban/search?q=x", { method: "POST" }),
                await deliveryWithBan(),
            );
            expect(res.status).toBe(405);
            expect(fetchSpy).not.toHaveBeenCalled();
        } finally {
            fetchSpy.mockRestore();
        }
    });

    test("no gateway configured → 501", async () => {
        const delivery = { gateway: undefined, cmsPathPrefix: "/.cms" } as unknown as DeliveryCms;
        const res = await GatewayServer(new Request("http://d/.cms/gateway/ban/search?q=x"), delivery);
        expect(res.status).toBe(501);
    });
});
