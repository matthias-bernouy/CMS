import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { PublishedResource } from "./types";

export function assertCatalogueRow(value: unknown, resource: PublishedResource) {
    const row = requireRecord(value);
    const { metadata, ...reference } = row;
    assertCondition(
        canonicalizeIJson(reference) === canonicalizeIJson(resource.reference),
        "registry-discovery-reference",
    );
    const expected = { ...resource.metadata };
    const actual = { ...requireRecord(metadata) };
    if (resource.reference.kind === "contract") {
        assertCondition(
            typeof actual.publishedAt === "string" &&
                Date.parse(actual.publishedAt) >= resource.startedAt - 1000 &&
                Date.parse(actual.publishedAt) <= resource.finishedAt + 1000,
            "registry-discovery-publication-date",
        );
        delete actual.publishedAt;
    }
    assertCondition(canonicalizeIJson(actual) === canonicalizeIJson(expected), "registry-discovery-authored-metadata");
}

export function catalogueOracle(expected: readonly PublishedResource[], offset: number, limit = 16) {
    return (value: unknown) => {
        const output = requireRecord(value);
        assertCondition(
            Array.isArray(output.releases) && output.releases.length === expected.slice(offset, offset + limit).length,
            "registry-discovery-page-size",
        );
        for (const [index, row] of output.releases.entries()) {
            assertCatalogueRow(row, expected[offset + index]!);
        }
        assertCondition(
            (output.nextCursor !== undefined) === offset + limit < expected.length,
            "registry-discovery-page-exhaustion",
        );
        if (output.nextCursor !== undefined) {
            assertCondition(
                typeof output.nextCursor === "string" && /^[A-Za-z0-9_-]{1,1024}$/u.test(output.nextCursor),
                "registry-discovery-cursor-shape",
            );
        }
        assertCondition(
            Object.keys(output).every((key) => ["releases", "nextCursor"].includes(key)),
            "registry-discovery-public-projection",
        );
    };
}

export function searchOracle(
    expected: readonly PublishedResource[],
    exact: PublishedResource,
    firstPage: boolean,
    limit = 16,
) {
    return (value: unknown) => {
        const output = requireRecord(value);
        assertCondition(
            typeof output.revision === "string" &&
                /^sha256:[a-f0-9]{64}$/u.test(output.revision) &&
                ["lexical", "hybrid"].includes(String(output.mode)) &&
                output.degraded === (output.mode === "lexical"),
            "registry-search-mode-or-revision",
        );
        assertCondition(Array.isArray(output.results) && output.results.length <= limit, "registry-search-page-size");
        const seen = new Set<string>();
        for (const raw of output.results) {
            const row = requireRecord(raw);
            const ref = requireRecord(row.reference);
            const resource = expected.find(
                (candidate) => canonicalizeIJson(candidate.reference) === canonicalizeIJson(ref),
            );
            assertCondition(
                resource && !seen.has(resource.reference.id),
                "registry-search-stale-or-duplicate-reference",
            );
            seen.add(resource.reference.id);
            assertCondition(
                canonicalizeIJson(row) ===
                    canonicalizeIJson({
                        reference: resource.reference,
                        name: resource.name,
                        description: resource.description,
                        categories: [],
                        contractIds: resource.contractIds,
                    }),
                "registry-search-authored-fields",
            );
        }
        if (firstPage) {
            assertCondition(
                output.results.length === Math.min(limit, expected.length) &&
                    canonicalizeIJson(requireRecord(output.results[0]).reference) ===
                        canonicalizeIJson(exact.reference),
                "registry-search-exact-id-promotion",
            );
        }
        assertCondition(
            Object.keys(output).every((key) => ["revision", "mode", "degraded", "results", "nextCursor"].includes(key)),
            "registry-search-public-projection",
        );
    };
}
