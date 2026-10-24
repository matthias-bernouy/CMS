import { describe, expect, test } from "bun:test";
import { EditablePageDocument } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/document";
import type { EditorCatalogueItem } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/model";
import { heading } from "./fixtures";

describe("EditablePageDocument content", () => {
    test("edits the semantic Bloc root without introducing a wrapper", () => {
        const page = new EditablePageDocument("");
        const element = page.add(heading);
        const field = page.contentFields(element, heading)[0]!;

        expect(field.value).toBe("Heading");
        page.updateContentField(element, field.address, "Updated");

        expect(page.serialize()).toBe('<h2 cms-bloc="ulvia-official-heading">Updated</h2>');
    });

    test("replaces a Bloc root while preserving its authored state", () => {
        const page = new EditablePageDocument(
            '<button cms-bloc="ulvia-official-action" variant="outline"><span>Contact us</span></button>',
        );

        const replacement = page.replaceRootTag(page.elements()[0]!, "a");

        expect(replacement.localName).toBe("a");
        expect(page.serialize()).toBe(
            '<a cms-bloc="ulvia-official-action" variant="outline"><span>Contact us</span></a>',
        );
    });

    test("creates a declared native child when a wrapper has no default content", () => {
        const field: EditorCatalogueItem = {
            ...heading,
            id: "ulvia-official-field",
            defaultContent: "",
            authoringJson: JSON.stringify({
                root: { accepts: ["div"] },
                slots: {
                    "": {
                        accepts: [
                            {
                                kind: "native-element",
                                accepts: ["input"],
                                defaults: { type: "text", name: "field" },
                            },
                        ],
                    },
                },
            }),
        };
        const page = new EditablePageDocument("");
        page.add(field);

        expect(page.serialize()).toBe('<div cms-bloc="ulvia-official-field"><input type="text" name="field"></div>');
    });

    test("edits structured rich content without flattening its markup", () => {
        const prose: EditorCatalogueItem = {
            ...heading,
            id: "ulvia-official-prose",
            defaultContent: '<div slot="content"><p>Default prose</p></div>',
            authoringJson: JSON.stringify({
                root: { accepts: ["div"] },
                slots: { content: { accepts: [{ kind: "native-content", profile: "prose" }] } },
            }),
        };
        const page = new EditablePageDocument("");
        const element = page.add(prose);

        const field = page.contentFields(element, prose)[0]!;
        expect(field.value).toBe("Default prose");
        page.updateContentField(element, field.address, "Updated prose");

        expect(page.serialize()).toBe(
            '<div cms-bloc="ulvia-official-prose"><div slot="content"><p>Updated prose</p></div></div>',
        );
    });

    test("treats the declared default slot as the unnamed HTML slot", () => {
        const page = new EditablePageDocument("");
        const realHeading = {
            ...heading,
            authoringJson: JSON.stringify({
                root: { accepts: ["h2"] },
                slots: { default: { accepts: [{ kind: "native-content", profile: "phrasing" }] } },
            }),
        };
        const element = page.add(realHeading);

        expect(page.contentFields(element, realHeading)[0]?.value).toBe("Heading");
    });

    test("edits every simple native-content slot of a component", () => {
        const hero: EditorCatalogueItem = {
            ...heading,
            id: "fixture-hero",
            defaultContent: '<span slot="eyebrow">Intro</span><p slot="body">Body</p>',
            authoringJson: JSON.stringify({
                root: { accepts: ["div"] },
                slots: {
                    eyebrow: { accepts: [{ kind: "native-content", profile: "inline" }] },
                    body: { accepts: [{ kind: "native-content", profile: "prose" }] },
                },
            }),
        };
        const page = new EditablePageDocument("");
        const element = page.add(hero);

        const fields = page.contentFields(element, hero);
        expect(fields.map(({ label, profile, slot, value }) => ({ label, profile, slot, value }))).toEqual([
            { label: "Eyebrow", profile: "inline", slot: "eyebrow", value: "Intro" },
            { label: "Body", profile: "prose", slot: "body", value: "Body" },
        ]);
        page.updateContentField(element, fields[1]!.address, "Updated body");
        expect(page.serialize()).toContain('<p slot="body">Updated body</p>');
    });

    test("edits every prose leaf independently", () => {
        const prose: EditorCatalogueItem = {
            ...heading,
            id: "fixture-prose",
            defaultContent: '<div slot="body"><p>First paragraph.</p><p>Second paragraph.</p></div>',
            authoringJson: JSON.stringify({
                root: { accepts: ["div"] },
                slots: { body: { accepts: [{ kind: "native-content", profile: "prose" }] } },
            }),
        };
        const page = new EditablePageDocument("");
        const element = page.add(prose);
        const fields = page.contentFields(element, prose);

        expect(fields.map(({ label, value }) => ({ label, value }))).toEqual([
            { label: "Body 1", value: "First paragraph." },
            { label: "Body 2", value: "Second paragraph." },
        ]);
        page.updateContentField(element, fields[1]!.address, "Updated paragraph.");
        expect(page.serialize()).toContain("<p>First paragraph.</p><p>Updated paragraph.</p>");
    });

    test("ignores SVG text and edits the visible navigation label", () => {
        const navigation: EditorCatalogueItem = {
            ...heading,
            id: "fixture-navigation",
            defaultContent: '<svg slot="content"><title>Icon title</title></svg><span slot="content">Services</span>',
            authoringJson: JSON.stringify({
                root: { accepts: ["a"] },
                slots: { content: { accepts: [{ kind: "native-content", profile: "inline" }] } },
            }),
        };
        const page = new EditablePageDocument("");
        const element = page.add(navigation);
        const fields = page.contentFields(element, navigation);

        expect(fields.map(({ value }) => value)).toEqual(["Services"]);
        page.updateContentField(element, fields[0]!.address, "Training");
        expect(page.serialize()).toContain("<title>Icon title</title>");
        expect(page.serialize()).toContain('<span slot="content">Training</span>');
    });

    test("does not expose the text owned by a nested Bloc", () => {
        const section: EditorCatalogueItem = {
            ...heading,
            id: "fixture-section",
            defaultContent: '<p slot="body">Introduction</p><h2 cms-bloc="child" slot="body">Nested title</h2>',
            authoringJson: JSON.stringify({
                root: { accepts: ["div"] },
                slots: { body: { accepts: [{ kind: "native-content", profile: "prose" }] } },
            }),
        };
        const page = new EditablePageDocument("");
        const element = page.add(section);

        expect(page.contentFields(element, section).map(({ value }) => value)).toEqual(["Introduction"]);
    });

    test("edits a composition's declared inputs without exposing nested Bloc content", () => {
        const composition: EditorCatalogueItem = {
            ...heading,
            id: "fixture-composition",
            kind: "composition",
            defaultContent:
                '<span slot="heading">Authored heading</span><p slot="body">Authored body</p><h2 cms-bloc="child" slot="body">Internal child</h2>',
            authoringJson: JSON.stringify({
                root: { accepts: ["div"] },
                slots: {
                    heading: { accepts: [{ kind: "native-content", profile: "inline" }] },
                    body: { accepts: [{ kind: "native-content", profile: "prose" }] },
                },
            }),
        };
        const page = new EditablePageDocument("");
        const element = page.add(composition);

        expect(page.contentFields(element, composition).map(({ slot, value }) => ({ slot, value }))).toEqual([
            { slot: "heading", value: "Authored heading" },
            { slot: "body", value: "Authored body" },
        ]);
    });

    test("creates a required named native-content slot", () => {
        const badge: EditorCatalogueItem = {
            ...heading,
            id: "ulvia-official-badge",
            defaultContent: "",
            authoringJson: JSON.stringify({
                root: { accepts: ["div"] },
                slots: {
                    label: {
                        accepts: [{ kind: "native-content", profile: "inline" }],
                        min: 1,
                        max: 1,
                    },
                },
            }),
        };
        const page = new EditablePageDocument("");
        const element = page.add(badge);

        expect(page.serialize()).toBe('<div cms-bloc="ulvia-official-badge"><span slot="label"></span></div>');
        expect(page.contentFields(element, badge)[0]?.slot).toBe("label");
    });
});
