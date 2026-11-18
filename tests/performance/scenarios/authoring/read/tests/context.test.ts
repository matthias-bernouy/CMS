import { expect, test } from "bun:test";
import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { publisherModel } from "./context-model";

test("source contexts coalesce one publisher, enforce 26 owned namespaces and restore both real site roles", async () => {
    const model = await publisherModel();
    const namespaces = new Set<string>();
    for (let index = 0; index < 26; index++) {
        const context = model.contexts(model.environment);
        await context.initialize();
        namespaces.add(context.namespace);
        expect(model.configured.get(model.main.origin)).toBe("unit-owner");
        expect(model.configured.get(model.other.origin)).toBe(model.registry.publicationToken);
        await context.close();
        expect(model.configured.get(model.main.origin)).toBe(model.registry.publicationToken);
        expect(model.configured.has(model.other.origin)).toBe(false);
    }
    expect(namespaces.size).toBe(26);
    expect(model.creates()).toBe(1);
    await expect(model.contexts(model.environment).initialize()).rejects.toThrow("source-publisher-namespace-bound");
    expect(model.creates()).toBe(1);
});

test("a failed primary credential restoration still attempts to disconnect the secondary publisher", async () => {
    const model = await publisherModel();
    const context = model.contexts(model.environment);
    await context.initialize();
    model.failRestore();
    await expect(context.close()).rejects.toThrow("source-publisher-restore-failed");
    expect(model.configured.has(model.other.origin)).toBe(false);
    expect(model.writes).toContain(`${model.other.origin}:disconnect`);
});

test("source contexts refuse to overwrite an unknown pre-existing secondary publisher", async () => {
    const model = await publisherModel();
    model.configured.set(model.other.origin, "unknown-existing-publisher");
    const context = model.contexts(model.environment);
    await expect(context.initialize()).rejects.toThrow("source-other-publisher-must-start-disconnected");
    await context.close();
    expect(model.writes).toEqual([]);
    expect(model.configured.get(model.other.origin)).toBe("unknown-existing-publisher");
});

test("source state snapshots ignore only bounded fresh checkedAt while retaining exact public reservation evidence", async () => {
    const model = await publisherModel();
    const context = model.contexts(model.environment);
    await context.initialize();
    const before = await context.snapshot();
    await Bun.sleep(2);
    expect(canonicalizeIJson(await context.snapshot())).toBe(canonicalizeIJson(before));
    expect(model.checks).toHaveLength(2);
    expect(model.checks[0]).not.toBe(model.checks[1]);
    const owned = model.reservations.get(context.namespace)!;
    for (const mutation of [{ revision: 2 }, { state: "suspended" }, { updatedAt: "2000-01-01T00:00:00.000Z" }]) {
        model.reservations.set(context.namespace, { ...owned, ...mutation });
        await expect(context.snapshot()).rejects.toThrow("source-publisher-reservation-mutated");
    }
    model.reservations.set(context.namespace, owned);
    model.staleCheck();
    await expect(context.snapshot()).rejects.toThrow("namespace-read-page-row");
    await context.close();
});
