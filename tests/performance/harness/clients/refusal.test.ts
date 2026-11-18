import { expect, test } from "bun:test";
import { inventoryFixture } from "../../fixtures/inventory";
import { expectBodyRefusal } from "./refusal";

test("negative JSON probes reach the real binding with invalid inputs and cannot return coverage evidence", async () => {
    const fixture = await inventoryFixture();
    const target = {
        ...fixture.target,
        definition: {
            ...fixture.target.definition,
            input: { type: "object", properties: { value: { type: "string", maxLength: 32 } }, required: ["value"] },
            bindings: [
                {
                    id: "http",
                    transport: "http",
                    method: "QUERY",
                    path: "/read",
                    input: { body: true },
                    response: {
                        successStatuses: [200],
                        contentTypes: ["application/json"],
                        errorStatuses: {},
                    },
                },
            ],
        },
    } as const;
    const inventory = { ...fixture.inventory, targets: [target] };
    const bodies: unknown[] = [];
    let status = 422;
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            expect(request.headers.get("cookie")).toBe("owned=session");
            expect(new URL(request.url).pathname).toBe("/.cms/call/performance/child/read");
            bodies.push(await request.json());
            return Response.json({ refused: true }, { status });
        },
    });
    try {
        const session = { origin: server.url.origin, cookie: "owned=session" };
        expect(
            await expectBodyRefusal(inventory, session, "performance/child", "read", { value: "seed" }, { value: 42 }),
        ).toBeUndefined();
        expect(bodies).toEqual([{ value: 42 }]);
        status = 400;
        expect(
            await expectBodyRefusal(
                inventory,
                session,
                "performance/child",
                "read",
                { value: "seed" },
                { value: 42 },
                400,
            ),
        ).toBeUndefined();
        await expect(
            expectBodyRefusal(inventory, session, "performance/child", "read", { value: "seed" }, { value: 42 }, 422),
        ).rejects.toThrow("negative-probe-http-status-400");
        status = 200;
        await expect(
            expectBodyRefusal(inventory, session, "performance/child", "read", { value: "seed" }, { value: 42 }),
        ).rejects.toThrow();
        await expect(
            expectBodyRefusal(
                inventory,
                { ...session, origin: "https://ulvia.fr" },
                "performance/child",
                "read",
                { value: "seed" },
                { value: 42 },
            ),
        ).rejects.toThrow();
        expect(bodies).toHaveLength(4);
    } finally {
        server.stop(true);
    }
});
