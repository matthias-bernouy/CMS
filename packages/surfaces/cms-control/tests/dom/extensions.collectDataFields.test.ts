import { describe, test, expect, beforeEach } from "bun:test";
import { collectDataFields } from "cms-control/core/editorSystem/extensions/collectDataFields";
import type { DataExtension } from "cms-control/core/editorSystem/extensions/types";
import type { JSONSchema } from "@bernouy/cms-gateway";

function resetDom() {
    document.body.querySelectorAll("*").forEach((n) => {
        if ((n as HTMLElement).id !== p9r.id.EDITOR_SYSTEM) n.remove();
    });
    document.compIdentifierToEditor = new Map();
}

function attachEditor(el: HTMLElement, exts: DataExtension[]): void {
    const id = "test-" + Math.random().toString(36).slice(2);
    el.setAttribute(p9r.attr.EDITOR.IDENTIFIER, id);
    document.compIdentifierToEditor!.set(id, {
        listExtensions: (surface: string) => surface === "data" ? exts : [],
    } as never);
}

function dataExt(opts: { id: string; label: string; schema: JSONSchema | null; enabled?: () => boolean }): DataExtension {
    return {
        id:        opts.id,
        label:     () => opts.label,
        getSchema: () => opts.schema,
        enabled:   opts.enabled,
    };
}

describe("collectDataFields", () => {

    beforeEach(resetDom);

    test("returns [] when no ancestor declares a data extension", () => {
        const caret = document.createElement("span");
        document.body.appendChild(caret);
        expect(collectDataFields(caret)).toEqual([]);
    });

    test("flattens a single ancestor's schema with sourceId/label propagated", () => {
        const editor = document.createElement("div");
        const caret  = document.createElement("span");
        editor.appendChild(caret);
        document.body.appendChild(editor);
        attachEditor(editor, [dataExt({
            id: "fetch1",
            label: "User profile",
            schema: { type: "object", properties: { name: { type: "string" } } },
        })]);

        const out = collectDataFields(caret);
        expect(out).toEqual([{
            sourceId: "fetch1", sourceLabel: "User profile",
            path: "name", label: "name", type: "string",
        }]);
    });

    test("inner-first ordering across nested data sources", () => {
        const grand  = document.createElement("div");
        const parent = document.createElement("div");
        const caret  = document.createElement("span");
        grand.appendChild(parent);
        parent.appendChild(caret);
        document.body.appendChild(grand);
        attachEditor(grand,  [dataExt({
            id: "outer", label: "Outer",
            schema: { type: "object", properties: { o: { type: "string" } } },
        })]);
        attachEditor(parent, [dataExt({
            id: "inner", label: "Inner",
            schema: { type: "object", properties: { i: { type: "string" } } },
        })]);

        const ids = collectDataFields(caret).map(f => f.sourceId);
        expect(ids).toEqual(["inner", "outer"]);
    });

    test("skips extensions disabled by the bloc", () => {
        const editor = document.createElement("div");
        const caret  = document.createElement("span");
        editor.appendChild(caret);
        document.body.appendChild(editor);
        attachEditor(editor, [
            dataExt({
                id: "off", label: "Disabled",
                schema: { type: "object", properties: { x: { type: "string" } } },
                enabled: () => false,
            }),
            dataExt({
                id: "on", label: "Enabled",
                schema: { type: "object", properties: { y: { type: "string" } } },
            }),
        ]);

        const ids = collectDataFields(caret).map(f => f.sourceId);
        expect(ids).toEqual(["on"]);
    });

    test("skips extensions whose schema is null (not synced yet)", () => {
        const editor = document.createElement("div");
        const caret  = document.createElement("span");
        editor.appendChild(caret);
        document.body.appendChild(editor);
        attachEditor(editor, [dataExt({ id: "unsynced", label: "Loading", schema: null })]);

        expect(collectDataFields(caret)).toEqual([]);
    });

    test("array fields surface as `<path>.length` scalars", () => {
        const editor = document.createElement("div");
        const caret  = document.createElement("span");
        editor.appendChild(caret);
        document.body.appendChild(editor);
        attachEditor(editor, [dataExt({
            id: "src", label: "Src",
            schema: { type: "object", properties: { items: { type: "array", items: { type: "string" } } } },
        })]);

        expect(collectDataFields(caret)).toEqual([{
            sourceId: "src", sourceLabel: "Src",
            path: "items.length", label: "length", type: "integer",
        }]);
    });
});
