import { describe, test, expect, beforeEach } from "bun:test";
import { collectAncestorExtensions } from "src/control/core/editorSystem/extensions/collectAncestors";
import type { RichTextBarExtension } from "src/control/core/editorSystem/extensions/types";

// Tests use `label` as a stable identity probe — it's a getter returning the
// extension's own name, which lets us assert ordering by reading `e.label()`.
function rtb(name: string): RichTextBarExtension {
    return { label: () => name, getCompletions: () => [], onPick: () => "" };
}

function resetDom() {
    document.body.querySelectorAll("*").forEach((n) => {
        if ((n as HTMLElement).id !== p9r.id.EDITOR_SYSTEM) n.remove();
    });
    document.compIdentifierToEditor = new Map();
}

/** Attaches the EDITOR identifier attribute on `el` and registers a fake Editor
 *  that exposes the given richtextbar extensions when listExtensions is called.
 *  `target` is set to `el` so the walker's panel-input shortcut (which jumps
 *  to `owner.target`) sees a usable element. */
function attachEditor(el: HTMLElement, exts: RichTextBarExtension[]): void {
    const id = "test-" + Math.random().toString(36).slice(2);
    el.setAttribute(p9r.attr.EDITOR.IDENTIFIER, id);
    document.compIdentifierToEditor!.set(id, {
        target: el,
        listExtensions: (surface: string) => surface === "richtextbar" ? exts : [],
    } as never);
}

describe("collectAncestorExtensions", () => {

    beforeEach(resetDom);

    test("returns [] when fromEl has no [p9r-identifier] ancestor", () => {
        const caret = document.createElement("span");
        document.body.appendChild(caret);
        expect(collectAncestorExtensions(caret, "richtextbar")).toEqual([]);
    });

    test("returns [] when the ancestor editor has no extensions on this surface", () => {
        const editor = document.createElement("div");
        const caret  = document.createElement("span");
        editor.appendChild(caret);
        document.body.appendChild(editor);
        attachEditor(editor, []);
        expect(collectAncestorExtensions(caret, "richtextbar")).toEqual([]);
    });

    test("returns the editor's extensions when caret is inside it", () => {
        const editor = document.createElement("div");
        const caret  = document.createElement("span");
        editor.appendChild(caret);
        document.body.appendChild(editor);
        const a = rtb("a");
        const b = rtb("b");
        attachEditor(editor, [a, b]);
        expect(collectAncestorExtensions(caret, "richtextbar")).toEqual([a, b]);
    });

    test("returns extensions in inner-first order across nested editors", () => {
        const grand  = document.createElement("div");
        const parent = document.createElement("div");
        const caret  = document.createElement("span");
        grand.appendChild(parent);
        parent.appendChild(caret);
        document.body.appendChild(grand);
        attachEditor(grand,  [rtb("g1"), rtb("g2")]);
        attachEditor(parent, [rtb("p1")]);
        const out = collectAncestorExtensions(caret, "richtextbar");
        expect(out.map(e => e.label())).toEqual(["p1", "g1", "g2"]);
    });

    test("includes the start element if it is itself an editor", () => {
        const editor = document.createElement("div");
        document.body.appendChild(editor);
        attachEditor(editor, [rtb("self")]);
        expect(collectAncestorExtensions(editor, "richtextbar").map(e => e.label())).toEqual(["self"]);
    });

    test("skips ancestors whose identifier no longer maps to an Editor (disposed mid-walk)", () => {
        const grand  = document.createElement("div");
        const parent = document.createElement("div");
        const caret  = document.createElement("span");
        grand.appendChild(parent);
        parent.appendChild(caret);
        document.body.appendChild(grand);
        attachEditor(grand,  [rtb("g")]);
        attachEditor(parent, [rtb("p")]);
        // Simulate parent's editor being disposed (identifier still on DOM but
        // no longer in the registry).
        const parentId = parent.getAttribute(p9r.attr.EDITOR.IDENTIFIER)!;
        document.compIdentifierToEditor!.delete(parentId);
        expect(collectAncestorExtensions(caret, "richtextbar").map(e => e.label())).toEqual(["g"]);
    });

    test("panel-input shortcut: PARENT_IDENTIFIER routes the walk to the owner's target", () => {
        // Bloc tree (the actual page DOM)
        const grand  = document.createElement("div");
        const parent = document.createElement("div");
        grand.appendChild(parent);
        document.body.appendChild(grand);
        attachEditor(grand,  [rtb("g")]);
        attachEditor(parent, [rtb("p")]);

        // Detached panel hosting an input — declares its owner via
        // PARENT_IDENTIFIER (mirroring what `panel._initFromHTML` does).
        const panelInput = document.createElement("input");
        panelInput.setAttribute(
            p9r.attr.EDITOR.PARENT_IDENTIFIER,
            parent.getAttribute(p9r.attr.EDITOR.IDENTIFIER)!,
        );
        document.body.appendChild(panelInput);

        const out = collectAncestorExtensions(panelInput, "richtextbar").map(e => e.label());
        expect(out).toEqual(["p", "g"]);
    });

    test("panel-input shortcut is a fallback — DOM ancestry wins when present", () => {
        const grand  = document.createElement("div");
        const parent = document.createElement("div");
        const caret  = document.createElement("span");
        const orphan = document.createElement("div");
        grand.appendChild(parent);
        parent.appendChild(caret);
        document.body.appendChild(grand);
        document.body.appendChild(orphan);
        attachEditor(grand,  [rtb("g")]);
        attachEditor(parent, [rtb("p")]);
        attachEditor(orphan, [rtb("orphan")]);
        // Caret has both a real DOM ancestor (parent) AND a PARENT_IDENTIFIER
        // pointing elsewhere — DOM ancestry wins, the shortcut isn't taken.
        caret.setAttribute(
            p9r.attr.EDITOR.PARENT_IDENTIFIER,
            orphan.getAttribute(p9r.attr.EDITOR.IDENTIFIER)!,
        );
        const out = collectAncestorExtensions(caret, "richtextbar").map(e => e.label());
        expect(out).toEqual(["p", "g"]);
    });
});
