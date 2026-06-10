import { afterEach, describe, expect, test } from "bun:test";
import { BindingCoreEditor } from "cms-control/core/editorSystem/defaultEditors/BindingCoreEditor";
import { clearEditorContext, setEditorContext } from "cms-control/core/editorSystem/editorContext";

type TestCore = HTMLElement & {
    runtime: { deactivate(): void } | null;
    startRuntime(): void;
};

function makeHost(): HTMLElement {
    const host = document.createElement("cms-editor-system") as HTMLElement & {
        blocActions: { close(): void };
    };
    host.blocActions = { close: () => {} };
    document.body.appendChild(host);
    return host;
}

function makeCore(host: HTMLElement, hooks: { deactivate?: () => void; startRuntime?: () => void } = {}): TestCore {
    const core = document.createElement("div") as unknown as TestCore;
    core.runtime = { deactivate: hooks.deactivate ?? (() => {}) };
    core.startRuntime = hooks.startRuntime ?? (() => {});
    host.appendChild(core);
    return core;
}

afterEach(() => {
    clearEditorContext();
    document.body.replaceChildren();
    (document as any).compIdentifierToEditor = new Map();
});

describe("BindingCoreEditor", () => {
    test("viewEditor() keeps the binding core out of drag and drop", () => {
        const host = makeHost();
        const core = makeCore(host);
        const editor = new BindingCoreEditor(core);

        editor.viewEditor();

        expect(core.getAttribute(p9r.attr.ACTION.DISABLE_DRAGGING)).toBe("true");
        expect(core.getAttribute("draggable")).toBe("false");
        expect(core.classList.contains("editor-block")).toBe(true);
        editor.dispose();
    });

    test("constructor resumes runtime immediately when the editor context is already in view mode", () => {
        const calls: string[] = [];
        setEditorContext({ mode: "view" });
        const host = makeHost();
        const core = makeCore(host, {
            deactivate: () => calls.push("deactivate"),
            startRuntime: () => calls.push("startRuntime"),
        });
        const editor = new BindingCoreEditor(core);

        expect(calls).toEqual(["startRuntime"]);
        editor.dispose();
    });

    test("constructor pauses runtime immediately when the editor context is in editor mode", () => {
        const calls: string[] = [];
        const host = makeHost();
        const core = makeCore(host, {
            deactivate: () => calls.push("deactivate"),
            startRuntime: () => calls.push("startRuntime"),
        });
        const editor = new BindingCoreEditor(core);

        expect(calls).toEqual(["deactivate"]);
        editor.dispose();
    });
});
