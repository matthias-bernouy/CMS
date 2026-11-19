import { expect, test } from "bun:test";
import { inventoryFixture } from "../../../fixtures/inventory";
import { prepareFavicon } from "./favicon";
import type { ScenarioClient } from "../../../harness/clients/session";
import type { QueryEnvironment } from "../../queries/execute";

async function fixture() {
    const base = await inventoryFixture();
    let stored = { revision: 0, favicon: "" };
    let releases = 0;
    const events: string[] = [];
    const client: ScenarioClient = async (_contract, capability, _binding, input, assert = () => {}, options = {}) => {
        events.push(capability);
        const refusal = (status: number) => ({
            observation: { ...base.measurement, validated: false, status },
            output: undefined,
        });
        if (options.httpCredentials?.cookie === "foreign-main") {
            return refusal(401);
        }
        if (capability === "site.favicon.update") {
            if (input.expectedRevision !== stored.revision) {
                return refusal(409);
            }
            if (String(input.favicon).startsWith("javascript:")) {
                return refusal(422);
            }
            stored = { revision: stored.revision + 1, favicon: String(input.favicon ?? "") };
        }
        await assert(stored);
        return { observation: base.measurement, output: { ...stored } };
    };
    const lease = {
        value: {
            client,
            prepare: async () => {},
            fixture: async (capability: string, input: Readonly<Record<string, unknown>> = {}) => {
                const result = await client("ulvia/cms.content", capability, "http", input);
                expect(result.observation.validated).toBe(true);
                return result.output as Readonly<Record<string, unknown>>;
            },
        },
        release: () => {
            releases++;
        },
    };
    return {
        lease,
        events,
        state: () => stored,
        releases: () => releases,
        restart(favicon = stored.favicon) {
            events.push("provider-restart");
            stored = { revision: stored.revision + 3, favicon };
        },
    };
}
const environment = { main: { cookie: "foreign-main" } } as QueryEnvironment;

test("favicon writes validate optimistic revision zero, refusals, restoration and lease release", async () => {
    const state = await fixture();
    const sample = await prepareFavicon(state.lease, environment, "site.favicon.update", "http", "nominal");
    expect(state.state()).toEqual({ revision: 0, favicon: "" });
    expect((await sample.send()).validated).toBe(true);
    expect(state.state().revision).toBe(1);
    expect(state.state().favicon).toMatch(/^\/performance-favicon-/u);
    await sample.verify!();
    expect(state.state().revision).toBe(1);
    await sample.close!();
    expect(state.state()).toEqual({ revision: 2, favicon: "" });
    expect(state.releases()).toBe(1);
});

test("favicon invalidation primes then mutates before the timed read and releases failed preparation", async () => {
    const state = await fixture();
    const sample = await prepareFavicon(state.lease, environment, "site.favicon.get", "mcp", "invalidation");
    expect(state.events.slice(0, 4)).toEqual([
        "site.favicon.get",
        "site.favicon.get",
        "site.favicon.update",
        "site.favicon.get",
    ]);
    expect(state.state().revision).toBe(1);
    expect((await sample.send()).validated).toBe(true);
    await sample.verify!();
    await sample.close!();
    expect(state.state().favicon).toBe("");
    expect(state.releases()).toBe(1);
    const failed = {
        ...state.lease,
        value: {
            ...state.lease.value,
            prepare: async () => {
                throw new Error("Preparation failure");
            },
        },
    };
    await expect(prepareFavicon(failed, environment, "site.favicon.get", "http", "nominal")).rejects.toThrow(
        "Preparation failure",
    );
    expect(state.releases()).toBe(2);
});

for (const capability of ["site.favicon.get", "site.favicon.update"]) {
    test(`cold ${capability} refreshes the post-restart revision without priming the measured target`, async () => {
        const state = await fixture();
        const sample = await prepareFavicon(state.lease, environment, capability, "http", "cold");
        expect(state.events).toEqual(["site.favicon.get"]);
        state.restart();
        await sample.beforeMeasure!();
        expect(state.events).toEqual(["site.favicon.get", "provider-restart", "site.get"]);
        expect((await sample.send()).validated).toBe(true);
        expect(state.state().revision).toBe(capability === "site.favicon.update" ? 4 : 3);
        await sample.verify!();
        await sample.close!();
        expect(state.state().favicon).toBe("");
        expect(state.releases()).toBe(1);
    });
}

test("refreshing a cold favicon revision does not accept a changed persisted reference", async () => {
    const state = await fixture();
    const sample = await prepareFavicon(state.lease, environment, "site.favicon.get", "http", "cold");
    state.restart("/unexpected-restart-reference.svg");
    await sample.beforeMeasure!();
    await expect(sample.send()).rejects.toThrow("favicon-output-mismatch");
    await sample.close!();
    expect(state.state().favicon).toBe("");
    expect(state.releases()).toBe(1);
});
