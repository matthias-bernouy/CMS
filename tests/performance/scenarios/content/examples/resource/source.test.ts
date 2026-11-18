import { expect, test } from "bun:test";
import { inventoryFixture } from "../../../../fixtures/inventory";
import { publicationCollection } from "../../../repository/resources/collection";
import { exampleSources } from "./source";

test("example fixtures compile and admit 65 documents with distinct versioned HTML and two authored locales", async () => {
    const fixture = await inventoryFixture();
    const namespace = "performance-unit";
    const suffix = "examples-large";
    const id = `${namespace}/fixture-collection-${suffix}`;
    const first = await publicationCollection(namespace, fixture.target.release, exampleSources(id, "1.0.0"), {
        suffix,
        version: "1.0.0",
    });
    const second = await publicationCollection(namespace, fixture.target.release, exampleSources(id, "1.0.10"), {
        suffix,
        version: "1.0.10",
    });
    expect(first.release.examples).toHaveLength(65);
    expect(first.release.examples!.find((example) => example.id === "example-000")!.document.html).toHaveLength(
        64 * 1024,
    );
    expect(second.release.examples).toHaveLength(65);
    expect(first.id).toBe(second.id);
    expect(first.digest).not.toBe(second.digest);
    expect(first.release.examples!.find((example) => example.id === "example-000")!.document.html).toContain(
        "Version 1.0.0 example 0",
    );
    expect(second.release.examples!.find((example) => example.id === "example-000")!.document.html).toContain(
        "Version 1.0.10 example 0",
    );
    const files = JSON.parse(second.sourceJson).files as { path: string; content: string }[];
    expect(files.find((file) => file.path === "translations/fr/performance.json")!.content).toContain(
        "Exemple de performance 1.0.10",
    );
    for (const count of [0, 65, NaN]) {
        expect(() => exampleSources(id, "1.0.0", count)).toThrow("example-source-count");
    }
});
