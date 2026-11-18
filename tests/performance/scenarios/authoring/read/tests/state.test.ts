import { beforeAll, expect, test } from "bun:test";
import { inventoryFixture } from "../../../../fixtures/inventory";
import { sourceReadState } from "../sources/state";
import { prepareSourceRead } from "../sources/recipe";
import { preparePublicationRead } from "../operations/recipe";
import { publicationStatusOracle } from "../operations/oracle";
import { sourceModel } from "./model";
import type { ContractParentReference } from "@bernouy/ulvia-contracts";

let implementation: ContractParentReference;
beforeAll(async () => {
    implementation = (await inventoryFixture()).target.release;
});

test("source history retains eight distinct versions per kind and discards each owned preparation", async () => {
    const model = sourceModel();
    const state = sourceReadState(model.calls, model.context.namespace, implementation, [
        "collection",
        "contract",
        "provider-manifest",
    ]);
    await state.initialize("history");
    expect(state.published).toHaveLength(24);
    expect(new Set(state.published.map((row) => row.digest)).size).toBe(24);
    for (const kind of ["collection", "contract", "provider-manifest"] as const) {
        expect(state.latest(kind).source.version).toBe("1.0.7");
    }
    expect(model.prepared.size).toBe(0);
    await state.close();
});

test("invalidation primes the exact missing immutable version before publication and rejects a cached null afterwards", async () => {
    for (const stale of [false, true]) {
        const model = sourceModel();
        const state = sourceReadState(model.calls, model.context.namespace, implementation, ["collection"]);
        await state.initialize("invalidation");
        model.events.length = 0;
        const sample = await prepareSourceRead(
            state,
            model.context,
            "get-collection-sources",
            "mcp",
            "invalidation",
            0,
            ["collection"],
            model.client,
            async () => {},
        );
        expect(model.events.indexOf("read:get-collection-sources:mcp")).toBeLessThan(
            model.events.indexOf("publish-collection"),
        );
        if (stale) {
            model.stale();
        }
        expect((await sample.send()).validated).toBe(!stale);
        expect(state.latest("collection").source.version).toBe("1.0.1");
    }
});

test("durable publication status invalidation proves pending then terminal state for the same operation", async () => {
    const model = sourceModel();
    const state = sourceReadState(model.calls, model.context.namespace, implementation, ["collection"]);
    const sample = await preparePublicationRead(
        state,
        model.context,
        model.client,
        "mcp",
        0,
        model.client,
        async () => {},
    );
    expect(model.events).toContain("read:get-publication-operation:mcp");
    expect(model.events).toContain("read:get-publication-operation:http");
    expect((await sample.send()).validated).toBe(true);
    expect(state.published).toHaveLength(1);
    expect(model.prepared.size).toBe(0);
    const expected = state.published[0]!;
    const oracle = publicationStatusOracle("unit-operation", expected);
    expect(() =>
        oracle({ operationId: "unit-operation", status: "succeeded", result: expected.publication }),
    ).not.toThrow();
    expect(() => oracle({ operationId: "unit-operation", status: "running" })).toThrow();
    expect(() =>
        oracle({
            operationId: "unit-operation",
            status: "succeeded",
            result: expected.publication,
            input: { secret: "private" },
        }),
    ).toThrow();
});

test("a publication already terminal when first observed cannot claim pending-to-terminal performance coverage", async () => {
    const model = sourceModel();
    model.finishBeforePrime();
    const state = sourceReadState(model.calls, model.context.namespace, implementation, ["collection"]);
    await expect(
        preparePublicationRead(state, model.context, model.client, "http", 0, model.client, async () => {}),
    ).rejects.toThrow("source-operation-completed-before-prime");
    expect(model.prepared.size).toBe(0);
});

test("source cleanup attempts every owned pending preparation after a partial discard failure", async () => {
    const model = sourceModel();
    let attempts = 0;
    const calls = {
        ...model.calls,
        fixture: async (...args: Parameters<typeof model.calls.fixture>) => {
            if (args[0] === "discard-preparation" && ++attempts === 1) {
                throw Error("controlled cleanup failure");
            }
            return model.calls.fixture(...args);
        },
    };
    const state = sourceReadState(calls, model.context.namespace, implementation, ["collection"]);
    await state.prepare(state.source("collection", 0));
    await state.prepare(state.source("collection", 1));
    await expect(state.close()).rejects.toThrow("source-reader-preparation-cleanup");
    expect(attempts).toBe(2);
    await state.close();
    expect(model.prepared.size).toBe(0);
});
