import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { CatalogueContract } from "../resources/contract";

export function documentationSearchOracle(resource: CatalogueContract, documentIndex?: number) {
    return (output: unknown) => {
        const row = requireRecord(output);
        assertCondition(
            ["lexical", "hybrid"].includes(String(row.mode)) && row.degraded === (row.mode === "lexical"),
            "metadata-documentation-retrieval-mode",
        );
        assertCondition(
            Array.isArray(row.results) &&
                row.results.length === (documentIndex === undefined ? Math.min(10, resource.documents.length) : 1),
            "metadata-documentation-result-count",
        );
        const seen = new Set<string>();
        for (const raw of row.results) {
            const result = requireRecord(raw);
            const reference = requireRecord(result.reference);
            const document =
                documentIndex === undefined
                    ? resource.documents.find((doc) => doc.path === reference.path)
                    : resource.documents[documentIndex];
            assertCondition(document && !seen.has(document.path), "metadata-documentation-known-unique-document");
            assertCondition(
                canonicalizeIJson(reference) ===
                    canonicalizeIJson({
                        contractId: resource.id,
                        releaseDigest: resource.digest,
                        path: document.path,
                    }) &&
                    result.version === resource.version &&
                    result.title === document.title &&
                    result.heading === document.title,
                "metadata-documentation-selected-identity",
            );
            assertCondition(
                typeof result.excerpt === "string" &&
                    result.excerpt.length > 0 &&
                    result.excerpt.length <= 1600 &&
                    document.content.includes(result.excerpt),
                "metadata-documentation-authored-excerpt",
            );
            assertCondition(
                canonicalizeIJson(result.capabilities) === canonicalizeIJson([document.capabilityId]),
                "metadata-documentation-exact-capability-reference",
            );
            seen.add(document.path);
        }
    };
}
