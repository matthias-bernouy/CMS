import { expect, test } from "bun:test";
import { searchPageOracle } from "./oracle";
import type { CollectionReadResource } from "../collections/resources/collection";

// Unit-only DTO identity: no artifact is admitted, invoked or counted as a measurement.
const result = {
    reference: {
        kind: "collection",
        publisherId: "owned",
        id: "owned/collection",
        version: "1.0.0",
        digest: `sha256:${"a".repeat(64)}` as CollectionReadResource["digest"],
    },
    name: "Collection reader",
    description: "Fixture",
    categories: [],
    contractIds: [],
    repositoryId: "owned-repository",
};
const expected = new Map([[result.reference.id, result]]);
const page = (mode: string, degraded: boolean) => ({
    mode,
    degraded,
    partial: false,
    unavailableRepositories: [],
    results: [result],
});

test("site discovery accepts both native modes with consistent complete single-source evidence", () => {
    const validate = searchPageOracle(expected, 16);
    expect(() => validate(page("lexical", true))).not.toThrow();
    expect(() => validate(page("hybrid", false))).not.toThrow();
    for (const value of [page("lexical", false), page("hybrid", true), page("unknown", false)]) {
        expect(() => validate(value)).toThrow("site-discovery-valid-search-mode");
    }
});

test("mode support preserves strict availability, identity, privacy and pagination bounds", () => {
    for (const mode of ["lexical", "hybrid"]) {
        const valid = page(mode, mode === "lexical");
        const validate = searchPageOracle(expected, 16);
        for (const changed of [
            { partial: true },
            { unavailableRepositories: ["foreign-repository"] },
            { results: [] },
            { results: [result, result] },
            { results: [{ ...result, reference: { ...result.reference, id: "foreign/collection" } }] },
            { results: [{ ...result, reference: { ...result.reference, digest: `sha256:${"b".repeat(64)}` } }] },
            { results: [{ ...result, privateToken: "never-accepted" }] },
            { nextCursor: "" },
            { nextCursor: "x".repeat(8193) },
        ]) {
            expect(() => validate({ ...valid, ...changed })).toThrow();
        }
        expect(() => searchPageOracle(expected, 0)(valid)).toThrow();
    }
});
