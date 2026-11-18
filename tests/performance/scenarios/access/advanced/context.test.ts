import { expect, test } from "bun:test";
import { officialCapabilityInventory } from "../../../capabilities/inventory";
import type { QueryEnvironment } from "../../queries/execute";
import { accessReadContext } from "./context";

test("partial signup cleanup resolves only previously attempted owned emails and continues after one deletion fails", async () => {
    const accounts = new Map<string, string>([["foreign", "foreign@performance.test"]]);
    const deleted: string[] = [];
    const searched: string[] = [];
    let failDeletion = true;
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const input = (await request.json()) as Record<string, unknown>;
            if (new URL(request.url).pathname.endsWith("/list-users")) {
                searched.push(String(input.search));
                const users = [...accounts]
                    .filter(([, email]) => email === input.search)
                    .map(([sub, email]) => ({
                        sub,
                        email,
                        administrator: false,
                        administratorRevision: 0,
                        createdAt: "2026-11-18T00:00:00.000Z",
                        lastSeenAt: "2026-11-18T00:00:00.000Z",
                    }));
                return Response.json({ users, total: users.length, page: 1, limit: 2, hasMore: false });
            }
            expect(new URL(request.url).pathname.endsWith("/delete-user")).toBe(true);
            const sub = String(input.sub);
            deleted.push(sub);
            if (sub === "owned-1" && failDeletion) {
                return Response.json({}, { status: 503 });
            }
            return Response.json({ sub, deleted: accounts.delete(sub) });
        },
    });
    const environment: QueryEnvironment = {
        stack: {
            id: "unit",
            providerName: "unit-provider",
            edgeName: "unit-edge",
            instanceId: "unit-instance",
            restartProvider: async () => {},
        },
        main: { origin: server.url.origin, subjectId: "unit-root", cookie: "unit-root-cookie", token: "", tools: [] },
        registry: { origin: "http://registry.localhost:1", subjectId: "foreign", cookie: "foreign-cookie" },
    };
    let signups = 0;
    const context = accessReadContext(await officialCapabilityInventory(), environment, async (email) => {
        const sub = `owned-${++signups}`;
        accounts.set(sub, email);
        if (signups === 1) {
            throw new Error("Login failed after the account was persisted");
        }
        return { cookie: "unit-only", accountId: sub, administrator: false };
    });
    try {
        await expect(context.create()).rejects.toThrow("Login failed");
        const second = await context.create();
        await expect(context.close()).rejects.toThrow();
        expect(deleted).toEqual(["owned-1", second.sub]);
        expect(accounts.has(second.sub)).toBe(false);
        expect(accounts.get("foreign")).toBe("foreign@performance.test");
        expect(searched).toHaveLength(1);
        expect(searched[0]).not.toBe("foreign@performance.test");
        failDeletion = false;
        await context.close();
        expect(deleted).toEqual(["owned-1", second.sub, "owned-1"]);
        expect([...accounts.keys()]).toEqual(["foreign"]);
        await context.close();
        expect(deleted).toHaveLength(3);
    } finally {
        await server.stop(true);
    }
});
