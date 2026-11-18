import { expect, test } from "bun:test";
import { admitCollectionReleaseJson } from "@bernouy/repository/collections";
import { parsePublicationUpload } from "@bernouy/repository/repository/publication";
import { publicationCollection } from "./collection";

test("collection publication fixtures preserve real admitted source and immutable build coordinates", async () => {
    const fixture = await publicationCollection("performance-collection", {
        contractId: "ulvia/cms.content",
        version: "1.0.0",
        digest: `sha256:${"a".repeat(64)}`,
    });
    const admitted = await admitCollectionReleaseJson(
        fixture.canonicalJson,
        fixture.assets.map(({ id, bytes }) => ({ id, bytes })),
    );
    expect(admitted.digest).toBe(fixture.digest);
    expect(admitted.release.collectionId).toBe(fixture.id);
    expect(admitted.release.publisherId).toBe(fixture.namespace);
    const build = parsePublicationUpload(fixture.manifest);
    expect(build.sourceJson).toBe(fixture.sourceJson);
    expect(build.canonicalJson).toBe(fixture.canonicalJson);
    expect(fixture.assets).toHaveLength(1);
    expect(build.assets[0]?.byteLength).toBe(fixture.assets[0]!.bytes.byteLength);
    expect(build.assets[0]?.digest).toBe(fixture.assets[0]!.digest);
    await expect(
        admitCollectionReleaseJson(fixture.canonicalJson, [{ id: fixture.assets[0]!.id, bytes: new Uint8Array([0]) }]),
    ).rejects.toThrow();
    const source = JSON.parse(fixture.sourceJson);
    expect(source.files.some((file: { path: string }) => file.path === "examples/panel/document.html")).toBe(true);
});

test("configurable collection fixtures retain unique identities, exact versions and admitted defaults", async () => {
    const fixture = await publicationCollection(
        "performance-config",
        {
            contractId: "ulvia/cms.content",
            version: "1.0.0",
            digest: `sha256:${"a".repeat(64)}`,
        },
        [],
        {
            suffix: "configured",
            version: "1.1.0",
            configuration: {
                schema: {
                    type: "object",
                    properties: { title: { type: "string", maxLength: 64 } },
                    required: ["title"],
                },
                defaults: { title: "Default" },
            },
        },
    );
    const admitted = await admitCollectionReleaseJson(
        fixture.canonicalJson,
        fixture.assets.map(({ id, bytes }) => ({ id, bytes })),
    );
    expect(admitted.release.collectionId).toBe("performance-config/fixture-collection-configured");
    expect(fixture.version).toBe("1.1.0");
    expect(admitted.release.configuration?.defaults).toEqual({ title: "Default" });
    const source = JSON.parse(fixture.sourceJson).files.find(
        (file: { path: string }) => file.path === "definition.json",
    );
    expect(JSON.parse(source.content).version).toBe("1.1.0");
});
