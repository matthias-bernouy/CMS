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
        });
        expect(parseCollectionReleaseJson(JSON.stringify(release))).toEqual(release);
        expect(Object.hasOwn(release, "pages")).toBe(false);
        expect(release.examples![0]).not.toHaveProperty("texts");
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

    test("preserves shared text references and applies settings without mutating collection text", () => {
        const release = parseCollectionRelease(exampleCollection());
        const before = JSON.stringify(release);
        const document = collectionExampleDocument(release, "atlas-panel-default");
        expect(document.html).toContain('tone="accent"');
        expect(document.html).toContain("{{ cms.i18n.atlas.greeting }}");
        expect(document.html).not.toContain("Hello");
        expect(JSON.stringify(release)).toBe(before);
        expect(release.texts![0]!.values["en-US"]).toBe("Hello <copy>");
    });

    test("rejects removed example fields without compatibility defaults", () => {
        for (const key of ["texts", "locale", "themeMode"]) {
            const source = exampleCollection();
            source.examples[0][key] = key === "texts" ? {} : "en";
            expect(() => parseCollectionRelease(source)).toThrow(`unknown property "${key}"`);
        }
        for (const key of ["locale", "themeMode"]) {
            const source = exampleCollection();
            source.examples[0].previews[0][key] = "light";
            expect(() => parseCollectionRelease(source)).toThrow(`unknown property "${key}"`);
        }
    });

    test("validates ordinary local and imported text references", () => {
        const source = exampleCollection();
        source.examples[0].document.html = source.examples[0].document.html.replace("atlas.greeting", "atlas.unknown");
        expect(() => parseCollectionRelease(source)).toThrow("unknown collection text");
        source.examples[0].document.html = source.examples[0].document.html.replace("atlas.unknown", "other.greeting");
        expect(() => parseCollectionRelease(source)).toThrow();
    });

    test("text references introduced by native insertion defaults are also validated", () => {
        const source = exampleCollection();
        source.blocs[0].root = {
            accepts: ["div"],
            attributes: { "aria-label": { required: false } },
            defaults: { "aria-label": "{{ cms.i18n.atlas.greeting }}" },
        };
        expect(() => parseCollectionRelease(source)).not.toThrow();
        source.blocs[0].root.defaults["aria-label"] = "{{ cms.i18n.atlas.missing }}";
        expect(() => parseCollectionRelease(source)).toThrow("unknown collection text");
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
