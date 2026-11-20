import { expect, test } from "bun:test";
import { verifyStoredCollectionReleaseJson } from "repository/collections/core/admission/collectionArtifact";
import { admitCollectionReleaseJson } from "repository/collections/core/admission/admitCollectionRelease";
import { compileBlocStyle } from "repository/collections/core/validation/styles/compile";
import historical from "./fixtures/historical-style.json";

// Captured with the committed pre-animation compiler; never regenerated from the implementation under test.
test("a previously admitted non-animated release keeps its exact canonical bytes and digest on reread", async () => {
    const read = await verifyStoredCollectionReleaseJson(historical.canonicalJson, historical.digest);
    expect(read.digest).toBe("sha256:53aa8b8f81a6bee7f1fc64bd582f0641245259934e88c9189b07c7cc90c6a044");
    expect(read.canonicalJson).toBe(historical.canonicalJson);
    const admitted = await admitCollectionReleaseJson(historical.canonicalJson, []);
    expect(admitted.digest).toBe(read.digest);
    expect(admitted.canonicalJson).toBe(historical.canonicalJson);
});

test.each([
    ":scope { opacity: .5;",
    "@media (min-width: 1px) { :scope { opacity: .5;",
    "/* animation-name: fade; */ :scope { opacity: .5;",
])("non-animated CSS retains historical implicit block closure without changing compiled bytes: %s", (source) => {
    const id = "example--atlas--panel";
    expect(compileBlocStyle(id, source)).toBe(
        `@layer ulvia.blocks {\n@scope ([cms-bloc="${id}"]) to (:scope [cms-bloc]) {\n${source}\n}\n}`,
    );
});

test.each([
    ":scope { animation: none;",
    "@keyframes fade { to { opacity: 1; }",
    "@keyframes fade {} :scope { animation: fade 1s;",
    ":scope {} } } .outside { opacity: .5; }",
])("implicit closure cannot admit incomplete animations or an escaped scope: %s", (source) => {
    expect(() => compileBlocStyle("example--atlas--panel", source)).toThrow(/balanced delimiters/);
});
