import { expect, test } from "bun:test";
import { collectionAuthoringDiagnostics } from "@bernouy/cms-repository/collections/build";
import { parseCollectionRelease } from "@bernouy/cms-repository/collections";
import { collectionDocument } from "../../../fixtures";

test("distinct Bloc identities sharing markup and styles produce no design warnings", () => {
    const source = collectionDocument() as any;
    const { examples: _examples, defaultExample: _defaultExample, ...definition } = source.blocs[0];
    source.blocs.push({ ...definition, id: "atlas-duplicate", catalogue: "hidden" });
    const release = parseCollectionRelease(source);
    expect(collectionAuthoringDiagnostics(release)).toEqual([]);
});

test("collection preparation still diagnoses invalid HTML after expanding examples", () => {
    const source = collectionDocument() as any;
    source.blocs[0].markup = '<main><main><slot name="body"></slot></main></main>';
    const release = parseCollectionRelease(source);
    expect(collectionAuthoringDiagnostics(release)).toContainEqual(
        expect.objectContaining({
            code: "page.main_nested",
            severity: "error",
            location: expect.objectContaining({ path: expect.stringContaining("examples/") }),
        }),
    );
});
