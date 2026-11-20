import { expect, test } from "bun:test";
import { executeCapability } from "@bernouy/ulvia-sdk/local";
import { installationsFeature } from "@bernouy/repository/features/installations";
import type { InstallationServices } from "@bernouy/repository/features/installations";
import { capabilityToolName } from "@bernouy/cms-gateway/mcp";
import { gatewayRoute } from "../../fixtures";

async function fixture(revisionPort = true) {
    const a = await gatewayRoute({ contractId: "ulvia/first", mcp: true });
    const b = await gatewayRoute({ contractId: "ulvia/second", mcp: true });
    const routes = new Map([
        ["ulvia/first", a],
        ["ulvia/second", b],
    ]);
    const state = { revision: "1", reads: [] as string[], fail: false, changing: false };
    const gateway = {
        siteId: "site-a",
        ...(revisionPort
            ? { catalogueRevision: async () => (state.changing ? crypto.randomUUID() : state.revision) }
            : {}),
        routes: {
            resolve: async (site: string, id: string) => {
                expect(site).toBe("site-a");
                state.reads.push(id);
                if (state.fail) {
                    throw new Error("read failed");
                }
                return routes.get(id) ?? null;
            },
        },
    };
    const services = { gateway } as unknown as InstallationServices;
    const name = capabilityToolName("ulvia/first", "item.list", "mcp");
    const call = (toolName = name, contractIds = [...routes.keys()]) =>
        executeCapability(installationsFeature, "gateway.mcp.resolve", {
            input: { contractIds, toolName, known: [] },
            services,
            context: {
                requestId: "index-test",
                siteId: "site-a",
                contractVersion: "1.5.0",
                providerId: "ulvia/provider",
                controlAuthority: true,
            },
        });
    return { a, b, routes, state, call, name };
}

test("stable index resolves only the current target; revisions and authorized catalogue changes rebuild", async () => {
    const f = await fixture();
    expect((await f.call()).found).toBe(true);
    expect(f.state.reads).toEqual(["ulvia/first", "ulvia/second"]);
    f.state.reads = [];
    expect((await f.call()).found).toBe(true);
    expect(f.state.reads).toEqual(["ulvia/first"]);
    f.state.reads = [];
    expect((await f.call("unknown")).found).toBe(false);
    expect(f.state.reads).toEqual([]);
    f.state.revision = "2";
    await f.call();
    expect(f.state.reads).toEqual(["ulvia/first", "ulvia/second"]);
    f.state.reads = [];
    await f.call(f.name, ["ulvia/first"]);
    expect(f.state.reads).toEqual(["ulvia/first"]);
    f.routes.delete("ulvia/first");
    await expect(f.call(f.name, ["ulvia/first"])).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    expect(f.state.reads).toEqual(["ulvia/first", "ulvia/first"]);
});

test("absent or unstable revision disables retention, and failed loads never poison future calls", async () => {
    for (const revisionPort of [false, true]) {
        const f = await fixture(revisionPort);
        f.state.changing = true;
        await f.call();
        await f.call();
        expect(f.state.reads).toHaveLength(4);
    }
    const f = await fixture();
    f.state.fail = true;
    await expect(f.call()).rejects.toThrow("read failed");
    expect(f.state.reads).toHaveLength(2);
    f.state.fail = false;
    await f.call();
    expect(f.state.reads).toHaveLength(4);
});

test("global collisions and stale exact pins cannot bypass lookup validation", async () => {
    const f = await fixture();
    f.routes.set("ulvia/second", f.a);
    await expect(f.call("unknown")).rejects.toThrow("duplicate tool identities");
    f.routes.set("ulvia/second", f.b);
    f.state.revision = "2";
    await f.call();
    f.routes.set("ulvia/first", { ...f.a, requestedRelease: f.b.requestedRelease });
    await expect(f.call()).rejects.toMatchObject({ code: "CORE_UNAVAILABLE" });
    const other = await fixture();
    other.routes.delete("ulvia/first");
    await expect(other.call(other.name, ["ulvia/first", "ulvia/second"])).rejects.toMatchObject({
        code: "CORE_UNAVAILABLE",
    });
});
