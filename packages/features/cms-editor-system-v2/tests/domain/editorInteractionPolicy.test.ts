import { describe, expect, test } from "bun:test";
import { CMS_BINDING_ATTRIBUTES, type EditorCatalogEntry, type SettingSection } from "@bernouy/cms-content/editor";

import {
    filterSettingSections,
    isCatalogEntryInsertable,
    isInsertionItemAllowed,
    resolveEditorInteractionPolicy,
} from "../../src/policy/editorInteractionPolicy";

describe("editor interaction policy", () => {
    test("defaults to the existing unrestricted editor behavior", () => {
        const policy = resolveEditorInteractionPolicy();

        expect(policy).toMatchObject({
            bindings: true,
            conditions: true,
            repeats: true,
            templates: true,
            looseMedia: true,
        });
    });

    test("filters disallowed binding settings, including row children", () => {
        const sections: SettingSection[] = [
            {
                kind: "self",
                label: "Settings",
                settings: [
                    { type: "text", label: "Title", attribute: "title" },
                    { type: "text", label: "Source", attribute: CMS_BINDING_ATTRIBUTES.source },
                    {
                        type: "row",
                        settings: [
                            { type: "text", label: "Class", attribute: "class" },
                            { type: "text", label: "Repeat", attribute: CMS_BINDING_ATTRIBUTES.repeat },
                            { type: "text", label: "Condition", attribute: CMS_BINDING_ATTRIBUTES.condition },
                        ],
                    },
                ],
            },
        ];

        const filtered = filterSettingSections(
            resolveEditorInteractionPolicy({ bindings: true, repeats: false, conditions: false }),
            sections,
        );

        expect(filtered[0]?.settings.map((setting) => setting.type)).toEqual(["text", "text", "row"]);
        const row = filtered[0]?.settings[2];
        expect(row?.type === "row" ? row.settings.map((setting) => setting.attribute) : []).toEqual(["class"]);
    });

    test("enforces templates, loose media, entry insertable and tag predicates", () => {
        const allowed = { tag: "basic-card" } as EditorCatalogEntry;
        const blocked = { tag: "site-self", insertable: false } as EditorCatalogEntry & { insertable: boolean };
        const policy = resolveEditorInteractionPolicy({
            templates: false,
            looseMedia: false,
            canInsertTag: (tag) => tag !== "private-card",
        });

        expect(isCatalogEntryInsertable(policy, allowed)).toBe(true);
        expect(isCatalogEntryInsertable(policy, blocked)).toBe(false);
        expect(isCatalogEntryInsertable(policy, { tag: "private-card" } as EditorCatalogEntry)).toBe(false);
        expect(isInsertionItemAllowed(policy, { kind: "template", id: "layout", label: "Layout", content: "" })).toBe(
            false,
        );
        expect(isInsertionItemAllowed(policy, { kind: "media", label: "Image" })).toBe(false);
    });
});
