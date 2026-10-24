import { describe, expect, test } from "bun:test";
import { EditablePageDocument } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/document";
import type { EditorCatalogueItem } from "../../../packages/official-repository/collections/ulvia-official/blocs/admin/pages/ulvia-official-page-editor/runtime/model";
import { heading } from "./fixtures";

describe("EditablePageDocument native elements", () => {
    test("edits text carried by a declared simple native element", () => {
        const field: EditorCatalogueItem = {
            ...heading,
            id: "ulvia-official-field",
            defaultContent: '<span slot="label">Email address</span>',
            authoringJson: JSON.stringify({
                root: { accepts: ["div"] },
                slots: {
                    label: {
                        accepts: [{ kind: "native-element", accepts: ["span"] }],
                        min: 1,
                        max: 1,
                    },
                },
            }),
        };
        const page = new EditablePageDocument("");
        const element = page.add(field);

        const content = page.contentFields(element, field)[0]!;
        expect({ label: content.label, profile: content.profile, slot: content.slot, value: content.value }).toEqual({
            label: "Label",
            profile: "inline",
            slot: "label",
            value: "Email address",
        });
        page.updateContentField(element, content.address, "Work email");
        expect(page.serialize()).toContain('<span slot="label">Work email</span>');
    });

    test("projects declared native attributes without exposing fixed contract details", () => {
        const input: EditorCatalogueItem = {
            ...heading,
            id: "ulvia-official-input",
            defaultContent: '<input type="email" name="email" autocomplete="email">',
            authoringJson: JSON.stringify({
                root: { accepts: ["div"] },
                slots: {
                    default: {
                        accepts: [
                            {
                                kind: "native-element",
                                accepts: ["input"],
                                attributes: {
                                    type: { required: true, values: ["text", "email", "tel"] },
                                },
                                defaults: { type: "text", name: "field", autocomplete: "off" },
                            },
                        ],
                    },
                },
            }),
        };
        const page = new EditablePageDocument("");
        const element = page.add(input);

        expect(page.nativeElementFields(element, input)[0]).toEqual({
            attributes: [
                { kind: "string", name: "type", required: true, value: "email", values: ["text", "email", "tel"] },
                { kind: "string", name: "name", required: false, value: "email", values: [] },
                { kind: "string", name: "autocomplete", required: false, value: "email", values: [] },
            ],
            label: "Element",
            slot: "",
            tag: "input",
            tags: ["input"],
        });
        page.updateNativeElementAttribute(element, "", "name", "contactEmail");
        expect(page.serialize()).toContain('name="contactEmail"');
    });
});
