import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition, requireRecord } from "../../../queries/types";
import type { AuthoredSource } from "./source";

export type PublishedSource = Readonly<{
    source: AuthoredSource;
    digest: string;
    publication: Readonly<Record<string, unknown>>;
}>;

export function sourceReadOracle(expected: PublishedSource) {
    return (value: unknown) => {
        const output = requireRecord(value);
        assertCondition(
            output.releaseDigest === expected.digest && typeof output.sourceJson === "string",
            "source-reader-release-pin",
        );
        assertCondition(
            Object.keys(output).toSorted().join(",") === "releaseDigest,sourceJson",
            "source-reader-output-projection",
        );
        const retained = requireRecord(JSON.parse(output.sourceJson));
        assertCondition(
            Array.isArray(retained.files) &&
                retained.files.length === expected.source.files.length &&
                Array.isArray(retained.assets) &&
                retained.assets.length === 0,
            "source-reader-retained-shape",
        );
        const actual = retained.files
            .map(requireRecord)
            .toSorted((left, right) => String(left.path).localeCompare(String(right.path)));
        const wanted = expected.source.files.toSorted((left, right) => left.path.localeCompare(right.path));
        // File strings remain exact, including versioned JSON and large valid whitespace.
        assertCondition(canonicalizeIJson(actual) === canonicalizeIJson(wanted), "source-reader-authored-content");
        assertCondition(
            Object.keys(retained).toSorted().join(",") === "assets,files",
            "source-reader-retained-projection",
        );
    };
}

export function assertSourcePublication(source: AuthoredSource, digest: string, value: unknown) {
    const receipt = requireRecord(value);
    const field = source.kind === "provider-manifest" ? "providerId" : `${source.kind}Id`;
    assertCondition(
        receipt.digest === digest &&
            receipt[field] === source.id &&
            receipt.publisherId === source.namespace &&
            receipt.version === source.version &&
            receipt.kind === source.kind &&
            receipt.added === true,
        "source-publication-receipt",
    );
    return { source, digest, publication: receipt };
}
