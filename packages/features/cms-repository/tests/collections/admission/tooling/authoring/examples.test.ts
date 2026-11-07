import { expect, test } from "bun:test";
import { collectionAuthoringDiagnostics } from "cms-repository/collections/tooling/authoring/exampleDiagnostics";
import { parseCollectionRelease } from "cms-repository/collections/core/parsing/parseCollectionRelease";
import { collectionDocument } from "../../../fixtures";

test("distinct Bloc identities sharing markup and styles produce no design warnings", () => {
    const source = collectionDocument() as any;
    const { examples: _examples, defaultExample: _defaultExample, ...definition } = source.blocs[0];
    source.blocs.push({ ...definition, id: "atlas-dofficial--atlas--duplicate", catalogue: "hidden" });
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

function releaseWithMainErrors(mainCount: number, exampleCount = 1) {
    const source = collectionDocument() as any;
    const bloc = source.blocs[0];
    const template = source.examples.find((example: { id: string }) => example.id === bloc.defaultExample);
    source.blocs = [bloc];
    source.examples = Array.from({ length: exampleCount }, (_, index) => ({
        ...template,
        id: `atlas-dofficial--atlas--invalid-${index}`,
    }));
    bloc.examples = source.examples.map((example: { id: string }) => example.id);
    bloc.defaultExample = source.examples[0].id;
    bloc.markup = "<main></main>".repeat(mainCount) + '<slot name="body"></slot>';
    return parseCollectionRelease(source);
}

test.each([1, 3])("collection diagnostics preserve one truncation marker across %s expanded examples", (count) => {
    const diagnostics = collectionAuthoringDiagnostics(releaseWithMainErrors(40, count));
    expect(diagnostics).toHaveLength(16);
    expect(diagnostics.slice(0, -1).every((diagnostic) => diagnostic.severity === "error")).toBe(true);
    expect(diagnostics.filter((diagnostic) => diagnostic.code === "analysis.truncated")).toHaveLength(1);
    expect(diagnostics.at(-1)).toMatchObject({ code: "analysis.truncated", severity: "warning" });
});

test("a complete report of exactly 16 errors does not acquire a truncation marker", () => {
    const diagnostics = collectionAuthoringDiagnostics(releaseWithMainErrors(17));
    expect(diagnostics).toHaveLength(16);
    expect(diagnostics.every((diagnostic) => diagnostic.severity === "error")).toBe(true);
    expect(diagnostics.some((diagnostic) => diagnostic.code === "analysis.truncated")).toBe(false);
});
