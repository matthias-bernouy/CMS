import { expect, test } from "bun:test";
import { oauthReadClient } from "./client";
import { oauthReadContext } from "./context";
import { oauthReadScenarios } from "./plan";
import { inventoryFixture } from "../../../../fixtures/inventory";
import { performanceCapabilityInventory } from "../../../../capabilities/inventory";
import type { AccessReadContext, OwnedAccount } from "../../advanced/context";
import type { QueryEnvironment } from "../../../queries/execute";

const actor: OwnedAccount = { sub: "owned", email: "owned@performance.test", cookie: "owned-cookie" };
const envelope = (value: unknown) => ({ resultJson: JSON.stringify(value) });

test("OAuth dataset preparation waits for real public windows and never retries timed reads", async () => {
    const fixture = await inventoryFixture();
    let attempts = 0;
    let clock = 0;
    let windows = 0;
    const sleeps: number[] = [];
    const call: AccessReadContext["call"] = async () => {
        attempts++;
        return {
            observation: fixture.measurement,
            output: envelope(attempts % 2 ? { error: "temporarily_unavailable", status: 429 } : { requestId: "owned" }),
        };
    };
    const client = oauthReadClient(
        call,
        async (milliseconds) => {
            sleeps.push(milliseconds);
            clock += milliseconds;
        },
        () => clock,
    );
    for (; windows < 5; windows++) {
        await client.preparation(actor, "prepare-mcp-authorization", {});
    }
    expect(clock).toBe(300250);
    expect(sleeps.every((value) => value <= 10000)).toBe(true);
    await expect(client.preparation(actor, "prepare-mcp-authorization", {})).rejects.toThrow(
        "oauth-read-window-budget",
    );
    const previous = attempts;
    const timed = await client.document(actor, "list-mcp-connections", {});
    expect(attempts).toBe(previous + 1);
    expect(timed.output).toBeDefined();
    await expect(client.preparation(actor, "list-mcp-connections", {})).rejects.toThrow();
});

test("OAuth preparation refuses non-rate errors immediately and stops when the deadline elapsed", async () => {
    const fixture = await inventoryFixture();
    let count = 0;
    const call: AccessReadContext["call"] = async () => {
        count++;
        return { observation: fixture.measurement, output: envelope({ error: "access_denied", status: 403 }) };
    };
    const client = oauthReadClient(call, async () => {
        throw Error("Unexpected sleep");
    });
    await expect(client.preparation(actor, "register-mcp-client", {})).rejects.toThrow(
        "oauth-read-preparation-refused",
    );
    expect(count).toBe(1);
    let now = 0;
    const deadline = oauthReadClient(
        call,
        async () => {},
        () => now,
    );
    now = 360001;
    await expect(deadline.preparation(actor, "register-mcp-client", {})).rejects.toThrow(
        "oauth-read-preparation-deadline",
    );
    expect(count).toBe(1);
});

test("partially initialized OAuth datasets remove only owned accounts and continue cleanup after role failures", async () => {
    const fixture = await inventoryFixture();
    const events: string[] = [];
    let created = 0;
    const accounts: AccessReadContext = {
        create: async () => ({ ...actor, sub: `owned-${++created}` }),
        call: async () => ({
            observation: fixture.measurement,
            output: envelope({ error: "access_denied", status: 403 }),
        }),
        fixture: async (capability, input) => {
            events.push(`${capability}:${input.sub}`);
            if (capability === "get-user") {
                return { administrator: true, administratorRevision: 1 };
            }
            if (input.enabled === false && input.sub === "owned-1") {
                throw Error("Owned role cleanup failed");
            }
            return { administrator: true, revision: 1 };
        },
        close: async () => {
            events.push("close-owned-accounts");
        },
    };
    const environment = { main: { origin: "http://localhost:1234" } } as QueryEnvironment;
    const context = oauthReadContext(await performanceCapabilityInventory(), environment, accounts);
    await expect(context.initialize()).rejects.toThrow();
    await expect(context.close()).rejects.toThrow("oauth-read-cleanup-failed");
    expect(events).toContain("set-administrator:owned-2");
    expect(events.at(-1)).toBe("close-owned-accounts");
    const length = events.length;
    await context.close();
    expect(events).toHaveLength(length);
});

test("the OAuth read plan adds exactly four current missing HTTP variants without historical duplication", async () => {
    const inventory = await performanceCapabilityInventory();
    const plans = oauthReadScenarios(inventory, "unit-fixture");
    expect(plans).toHaveLength(4);
    expect(plans.map((row) => row.definition.id)).toEqual([
        "access-oauth-read.list-mcp-connections.http.large",
        "access-oauth-read.list-mcp-connections.http.history",
        "access-oauth-read.list-mcp-connections.http.invalidation",
        "access-oauth-read.resolve-mcp-connection.http.invalidation",
    ]);
    expect(plans.every((row) => row.definition.samples === 10 && row.definition.budget.latencyMs === 1000)).toBe(true);
});
