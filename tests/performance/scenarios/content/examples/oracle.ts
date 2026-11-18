import { canonicalizeIJson } from "@bernouy/ulvia-contracts/protocol";
import { assertCondition } from "../../queries/types";
import type { ExampleResource } from "./resource/publish";

/** Expected ordering, previews and documents come from independently admitted authored bytes. */
export function exampleListOracle(
    resource: ExampleResource,
    revision: number,
    locale: string,
    offset: number,
    limit = 16,
) {
    const examples = resource.release.examples!;
    const french = locale === "fr";
    const items = examples.slice(offset, offset + limit).map((example) => ({
        id: example.id,
        label:
            example.id === "panel"
                ? "Panel"
                : french
                  ? `Exemple de performance ${resource.version}`
                  : `Performance example ${resource.version}`,
        description:
            example.id === "panel"
                ? "Panel"
                : french
                  ? `Exemple contrôlé ${resource.version}`
                  : `Controlled example ${resource.version}`,
        previews: example.previews,
    }));
    const expected = {
        revision,
        collectionId: resource.id,
        items,
        total: examples.length,
        offset,
        limit,
        locale,
        nextCursor: offset + limit < examples.length ? String(offset + limit) : "",
    };
    return (output: unknown) =>
        assertCondition(canonicalizeIJson(output) === canonicalizeIJson(expected), "example-exact-page");
}

export function exampleDocumentOracle(resource: ExampleResource, id: string) {
    const example = resource.release.examples!.find((entry) => entry.id === id);
    assertCondition(example, "example-authored-document-missing");
    const expected = { collectionId: resource.id, id, document: example.document };
    return (output: unknown) =>
        assertCondition(canonicalizeIJson(output) === canonicalizeIJson(expected), "example-exact-document");
}
