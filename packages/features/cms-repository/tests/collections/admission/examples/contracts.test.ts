import { parseSourceSnapshot } from "../../../../src/repository/authoring/snapshot";
import { describe, expect, test } from "bun:test";
import {
    admitCollectionRelease,
    collectionExampleDocument,
    parseCollectionRelease,
    parseCollectionReleaseJson,
} from "../../../../src/exports/collections/index";
import { exampleCollection } from "./fixture";
import { collectionDocument } from "../../fixtures";

describe("collection examples", () => {
    test("admits single and multi-root examples, translated categories and explicit frames", () => {
        const release = parseCollectionRelease(exampleCollection());
        expect(release.blocs[1]!.categories).toEqual(["category.layout", "category.content"]);
        expect(release.examples![0]!.previews[0]).toEqual({
            id: "desktop",
            frame: { width: 640, height: 240 },
            locale: "en-US",
            themeMode: "light",
        });
        expect(parseCollectionReleaseJson(JSON.stringify(release))).toEqual(release);
        expect(release.pages).toBeUndefined();
    });

    test.each(["description", "categories", "defaultExample"])("requires %s for listed v1 blocs", (key) => {
        const release = exampleCollection();
        delete release.blocs[0][key];
        expect(() => parseCollectionRelease(release)).toThrow();
    });

    test.each(
        [[], ["category.layout", "category.layout"], ["missing.translation"]].map((categories) => ({ categories })),
    )("rejects invalid category memberships %j", ({ categories }) => {
        const release = exampleCollection();
        release.blocs[0].categories = categories;
        expect(() => parseCollectionRelease(release)).toThrow();
    });

    test.each(["category", "defaultContent", "thumbnail"])("rejects removed Bloc field %s", (key) => {
        const release = exampleCollection();
        release.blocs[0][key] = "obsolete";
        expect(() => parseCollectionRelease(release)).toThrow("unknown property");
    });

    test("rejects every collection protocol except the fresh v1 format", () => {
        for (const protocol of ["ulvia-collection/v2", "ulvia-collection/v0", undefined]) {
            expect(() => parseCollectionRelease({ ...exampleCollection(), protocol })).toThrow("protocol");
        }
    });

    test("rejects a multi-root document as the default insertion", () => {
        const release = exampleCollection();
        release.blocs[0].defaultExample = "assembled";
        expect(() => parseCollectionRelease(release)).toThrow("exactly one root");
    });

    test("rejects missing examples, invalid settings and invalid slots", () => {
        for (const mutate of [
            (release: any) => release.blocs[0].examples.push("missing"),
            (release: any) =>
                (release.examples[0].document.html = '<div cms-bloc="atlas-panel" forbidden="true"></div>'),
            (release: any) =>
                (release.examples[0].document.html = '<div cms-bloc="atlas-panel"><p slot="unknown">Content</p></div>'),
        ]) {
            const release = exampleCollection();
            mutate(release);
            expect(() => parseCollectionRelease(release)).toThrow();
        }
    });

    test("validates all frame dimensions and rejects undeclared interaction scripts", () => {
        for (const value of [0, -1, 4097, 1.5, "640", undefined]) {
            const release = exampleCollection();
            release.examples[0].previews[0].frame.width = value;
            expect(() => parseCollectionRelease(release)).toThrow();
        }
        const release = exampleCollection();
        release.examples[0].previews[0].steps = [];
        expect(() => parseCollectionRelease(release)).toThrow("unknown property");
    });

    test("materializes escaped editable copy and settings without mutating collection text", () => {
        const release = parseCollectionRelease(exampleCollection());
        const before = JSON.stringify(release);
        const document = collectionExampleDocument(release, "atlas-panel-default");
        expect(document.html).toContain('tone="accent"');
        expect(document.html).toContain("Example &lt;copy&gt;");
        expect(document.html).not.toContain("cms.i18n");
        expect(JSON.stringify(release)).toBe(before);
        expect(release.texts![0]!.values["en-US"]).toBe("Hello");
    });

    test("rejects unknown and undeclared text fixture namespaces", () => {
        const release = exampleCollection();
        release.examples[0].texts.other = { greeting: { en: "Leak" } };
        expect(() => parseCollectionRelease(release)).toThrow();
        delete release.examples[0].texts.other;
        release.examples[0].texts.atlas.unknown = { en: "Unknown" };
        expect(() => parseCollectionRelease(release)).toThrow();
    });

    test("round-trips canonical v1 bytes and hashes example changes", async () => {
        const original = await admitCollectionRelease(collectionDocument());
        expect((await admitCollectionRelease(JSON.parse(original.canonicalJson))).digest).toBe(original.digest);
        const source = exampleCollection();
        const before = await admitCollectionRelease(source);
        source.examples[0].previews[0].frame.width = 800;
        expect((await admitCollectionRelease(source)).digest).not.toBe(before.digest);
    });
});

test("instance authoring snapshots retain example sources", () => {
    const snapshot = parseSourceSnapshot(
        JSON.stringify({
            files: [
                { path: "definition.json", content: "{}" },
                { path: "examples/contact/definition.json", content: "{}" },
                { path: "examples/contact/document.html", content: "<button>Contact</button>" },
            ],
        }),
    );
    expect(snapshot.files.map((file) => file.path)).toContain("examples/contact/document.html");
});
