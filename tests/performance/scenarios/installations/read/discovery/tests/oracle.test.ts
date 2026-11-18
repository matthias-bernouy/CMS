import { expect, test } from "bun:test";
import { performanceCapabilityInventory } from "../../../../../capabilities/inventory";
import { collectionStateModel } from "../../collections/tests/model";
import { prepareDiscoveryCorpus } from "../context";
import { expectedSearch, searchPageOracle, expectedResourceContent } from "../oracle";
import { verifySearchPages, searchPageInput } from "../pages";
import { validateSchemaValue } from "@bernouy/ulvia-contracts/schema";
import type { ScenarioClient } from "../../../../../harness/clients/session";

test("discovery corpus publishes real bounded identity/history schedules without installing unrelated content", async () => {
    const inventory = await performanceCapabilityInventory();
    for (const profile of ["large", "history", "invalidation"]) {
        const { state, calls } = await collectionStateModel(inventory);
        await prepareDiscoveryCorpus(state, profile);
        expect(state.resources.length).toBe(profile === "large" ? 64 : profile === "history" ? 33 : 1);
        expect(state.installed.size).toBe(0);
        expect(calls).toEqual([]);
        const expected = expectedSearch(state);
        expect(expected.size).toBe(profile === "large" ? 64 : 1);
        const result = [...expected.values()][0]!;
        expect(result.reference.version).toBe(profile === "history" ? "1.0.32" : "1.0.0");
        expect(() =>
            searchPageOracle(
                expected,
                16,
            )({ mode: "lexical", degraded: true, partial: false, unavailableRepositories: [], results: [result] }),
        ).not.toThrow();
        for (const bad of [
            { ...result, name: "wrong" },
            { ...result, token: "private" },
            { ...result, reference: { ...result.reference, version: "0.0.1" } },
        ]) {
            expect(() =>
                searchPageOracle(
                    expected,
                    16,
                )({ mode: "lexical", degraded: true, partial: false, unavailableRepositories: [], results: [bad] }),
            ).toThrow();
        }
        const text = JSON.parse(expectedResourceContent(state.resources[0]!));
        expect(text.blocs[0].markup).toBeUndefined();
        expect(text.blocs[0].catalogue).toBe("listed");
    }
});

test("search traverses the public fifty-candidate bound, never trusts cursor encoding and rejects missing/duplicate pages", async () => {
    const inventory = await performanceCapabilityInventory();
    const { state } = await collectionStateModel(inventory);
    await prepareDiscoveryCorpus(state, "large");
    const rows = [...expectedSearch(state).values()].slice(0, 50);
    const target = inventory.targets.find(
        (row) =>
            !row.retained &&
            row.release.contractId === "ulvia/cms.installations" &&
            row.definition.id === "repository.search",
    )!;
    let bad: "none" | "early" | "duplicate" | "repeat" = "none";
    const client: ScenarioClient = async (_contract, _capability, _binding, input, assert) => {
        validateSchemaValue(target.definition.input, input);
        const offset = input.cursor === undefined ? 0 : Number(String(input.cursor).slice("opaque-next-".length));
        const end = Math.min(rows.length, offset + Number(input.limit));
        const output = {
            mode: "lexical",
            degraded: true,
            partial: false,
            unavailableRepositories: [],
            results: bad === "duplicate" && offset ? rows.slice(0, end - offset) : rows.slice(offset, end),
            ...(end < rows.length && bad !== "early"
                ? { nextCursor: bad === "repeat" ? "opaque-next-16" : `opaque-next-${end}` }
                : {}),
        };
        validateSchemaValue(target.definition.output, output);
        await assert?.(output);
        return {
            output,
            observation: {
                traceId: "unit-only",
                durationMs: 1,
                requestBytes: 1,
                responseBytes: 1,
                status: 200,
                completed: true,
                validated: true,
                streamConsumed: true,
            },
        };
    };
    const bound = { ...state, tenant: { ...state.tenant, client } };
    await verifySearchPages(bound);
    expect((await searchPageInput(bound, 3)).cursor).toBe("opaque-next-48");
    bad = "early";
    await expect(verifySearchPages(bound)).rejects.toThrow("premature");
    bad = "duplicate";
    await expect(verifySearchPages(bound)).rejects.toThrow("duplicate");
    bad = "repeat";
    await expect(verifySearchPages(bound)).rejects.toThrow();
});
