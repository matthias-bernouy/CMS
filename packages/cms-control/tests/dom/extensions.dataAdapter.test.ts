import { describe, test, expect, beforeEach } from "bun:test";
import { adaptDataExtensions } from "cms-control/components/editor/RichTextBar/extensions/dataAdapter";
import type { DataExtension } from "cms-control/core/editorSystem/extensions/types";
import type { JSONSchema } from "cms-control/core/data/types";

function resetDom() {
    document.body.querySelectorAll("*").forEach((n) => {
        if ((n as HTMLElement).id !== p9r.id.EDITOR_SYSTEM) n.remove();
    });
    document.compIdentifierToEditor = new Map();
}

function attach(el: HTMLElement, exts: DataExtension[]): void {
    const id = "test-" + Math.random().toString(36).slice(2);
    el.setAttribute(p9r.attr.EDITOR.IDENTIFIER, id);
    document.compIdentifierToEditor!.set(id, {
        listExtensions: (surface: string) => surface === "data" ? exts : [],
    } as never);
}

function ext(id: string, label: string, schema: JSONSchema | null): DataExtension {
    return { id, label: () => label, getSchema: () => schema };
}

describe("adaptDataExtensions (richtextbar synthesis)", () => {

    beforeEach(resetDom);

    test("emits one virtual richtextbar extension per data source", () => {
        const editor = document.createElement("div");
        const caret  = document.createElement("span");
        editor.appendChild(caret);
        document.body.appendChild(editor);
        attach(editor, [
            ext("fetch1", "Profile", { type: "object", properties: { name: { type: "string" } } }),
            ext("fetch2", "Settings", { type: "object", properties: { theme: { type: "string" } } }),
        ]);

        const adapted = adaptDataExtensions(caret);
        expect(adapted.map(e => e.label())).toEqual(["Profile", "Settings"]);
    });

    test("inserted token is `{{ <sourceId>.<path> }}`", () => {
        const editor = document.createElement("div");
        document.body.appendChild(editor);
        attach(editor, [ext("user", "User", {
            type: "object",
            properties: { name: { type: "string" }, age: { type: "integer" } },
        })]);

        const [adapted] = adaptDataExtensions(editor);
        const fields    = adapted!.getCompletions();
        const byPath    = Object.fromEntries(fields.map(f => [f.path, f]));

        expect(byPath["user.name"]).toBeDefined();
        expect(byPath["user.age"]).toBeDefined();

        const inserted = adapted!.onPick(byPath["user.name"]!, {} as never);
        expect(inserted).toBe("{{ user.name }}");
    });

    test("primitive root schema yields a `{{ <sourceId> }}` token (no inner path)", () => {
        const editor = document.createElement("div");
        document.body.appendChild(editor);
        attach(editor, [ext("greeting", "Greeting", { type: "string" })]);

        const [adapted] = adaptDataExtensions(editor);
        const fields    = adapted!.getCompletions();
        expect(fields).toHaveLength(1);
        expect(fields[0]!.path).toBe("greeting");
        expect(adapted!.onPick(fields[0]!, {} as never)).toBe("{{ greeting }}");
    });

    test("drops sources whose schema is null (not synced yet)", () => {
        const editor = document.createElement("div");
        document.body.appendChild(editor);
        attach(editor, [
            ext("unsynced", "Loading", null),
            ext("ready",    "Ready",   { type: "object", properties: { x: { type: "string" } } }),
        ]);

        expect(adaptDataExtensions(editor).map(e => e.label())).toEqual(["Ready"]);
    });
});
