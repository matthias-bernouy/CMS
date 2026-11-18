import { expect, test } from "bun:test";
import { catalogueContract } from "../resources/contract";
import { documentationSearchOracle } from "../docs/oracle";

test("documentation oracles reject stale release identity, foreign text, wrong capability associations and duplicate documents", async () => {
    const resource = await catalogueContract("performance-metadata-oracle", 0, false);
    const document = resource.documents[0]!;
    const result = {
        reference: { contractId: resource.id, releaseDigest: resource.digest, path: document.path },
        version: resource.version,
        title: document.title,
        heading: document.title,
        excerpt: document.content.slice(0, 1600),
        capabilities: [document.capabilityId],
    };
    const oracle = documentationSearchOracle(resource);
    expect(() => oracle({ mode: "lexical", degraded: true, results: [result] })).not.toThrow();
    expect(() => oracle({ mode: "hybrid", degraded: false, results: [result] })).not.toThrow();
    for (const wrong of [
        { ...result, reference: { ...result.reference, releaseDigest: `sha256:${"0".repeat(64)}` } },
        { ...result, excerpt: "Foreign document content" },
        { ...result, capabilities: [] },
        { ...result, version: "0.0.1" },
    ]) {
        expect(() => oracle({ mode: "lexical", degraded: true, results: [wrong] })).toThrow();
    }
    expect(() => oracle({ mode: "lexical", degraded: true, results: [result, result] })).toThrow();
    expect(() => oracle({ mode: "lexical", degraded: false, results: [result] })).toThrow();
});
