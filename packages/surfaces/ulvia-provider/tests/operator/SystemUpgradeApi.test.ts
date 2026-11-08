import { expect, test } from "bun:test";
import { BunRunner } from "@bernouy/http-runner";
import { serveForTest } from "@bernouy/http-runner/testing";
import { ProviderOperatorApi } from "../../src/exports/index";
import type { ProviderInstanceLifecycle } from "../../src/exports/index";

test("system upgrade operator routes authenticate before validation and refuse extra input", async () => {
    const calls: unknown[] = [];
    const lifecycle = {
        reviewSystemUpgrade: async (id: string, input: unknown) => {
            calls.push({ id, input });
            return { planDigest: `sha256:${"b".repeat(64)}` };
        },
        upgradeSystem: async (_id: string, input: { planDigest: string }) => {
            if (input.planDigest !== `sha256:${"b".repeat(64)}`) {
                throw new TypeError("Review mismatch");
            }
            calls.push("apply");
            return { status: "ready" };
        },
        resumeSystemUpgrade: async () => {
            calls.push("resume");
            return { status: "ready" };
        },
    } as unknown as ProviderInstanceLifecycle;
    const runner = new BunRunner();
    new ProviderOperatorApi(runner, "operator-token-that-is-long-enough", lifecycle);
    const server = serveForTest(runner);
    const input = { expectedRevision: 1, administratorSub: "local:admin", manifestDigest: `sha256:${"a".repeat(64)}` };
    const request = (suffix: string, body: unknown, authenticated = true) =>
        server.request("POST", `/ulvia/operator/instances/instance%3Aone/system${suffix}`, {
            headers: {
                "content-type": "application/json",
                ...(authenticated ? { authorization: "Bearer operator-token-that-is-long-enough" } : {}),
            },
            body: JSON.stringify(body),
        });
    try {
        expect((await request("/plan", { invalid: true }, false)).status).toBe(401);
        expect((await request("/plan", { ...input, hidden: true })).status).toBe(400);
        expect((await request("/plan", { ...input, expectedRevision: -1 })).status).toBe(400);
        expect(calls).toEqual([]);
        const reviewed = await request("/plan", input);
        expect(reviewed.status).toBe(200);
        expect(reviewed.headers.get("cache-control")).toBe("no-store");
        expect(calls).toMatchObject([{ id: "instance:one", input }]);
        expect((await request("", { ...input, planDigest: `sha256:${"c".repeat(64)}` })).status).toBe(400);
        expect(calls).toHaveLength(1);
        expect((await request("", { ...input, planDigest: `sha256:${"b".repeat(64)}` })).status).toBe(200);
        expect((await request("/resume", { administratorSub: "local:admin" })).status).toBe(200);
        expect(calls.slice(1)).toEqual(["apply", "resume"]);
    } finally {
        await server.stop();
    }
});
