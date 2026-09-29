import { expect, test } from "bun:test";
import { admitCollectionReleaseJson } from "@bernouy/cms-repository/collections";

test("admits the checked-in Light DOM starter collection with its exact asset bytes", async () => {
    const base = new URL("../../fixtures/collections/v1/", import.meta.url);
    const document = await Bun.file(new URL("atlas.collection.json", base)).text();
    const admission = await admitCollectionReleaseJson(document, [
        { id: "preview", bytes: await Bun.file(new URL("preview.svg", base)).bytes() },
    ]);
    expect(admission.release.blocs.map((bloc) => bloc.kind)).toEqual(["composition", "component"]);
    expect(admission.assets[0]!.bytes.size).toBe(154);
});
