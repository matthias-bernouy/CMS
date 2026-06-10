import { describe, test, expect, beforeEach } from "bun:test";
import { ImageSync } from "cms-control/components/editor/componentSync/sync/ImageSync/ImageSync";
import { Editor } from "cms-control/core/editorSystem/Editor/Editor";

// Minimal `<cms-editor-system>` stub. Editor.constructor walks up via
// `closest("cms-editor-system")` and calls `.blocActions.close()` on the
// match, so a `<div id="editor-system">` host is not enough — the tag has
// to be a real custom element. The full EditorRoot pulls in heavy deps we
// don't want in the unit-test sandbox.
if (!customElements.get("cms-editor-system")) {
    customElements.define("cms-editor-system", class extends HTMLElement {
        get blocActions() {
            return { close: () => {}, open: () => {}, setEditor: () => {} };
        }
    });
}

class SlotEditor extends Editor {
    constructor(n: HTMLElement) { super(n, ""); }
    override init() {}
    override restore() {}
    get features() { return (this as any)._actionBarFeatures as Map<string, boolean>; }
}

function reset(): HTMLElement {
    document.body.innerHTML = "";
    const host = document.createElement("cms-editor-system");
    host.id = p9r.id.EDITOR_SYSTEM;
    document.body.appendChild(host);
    return host;
}

function nextFrame(): Promise<void> {
    return new Promise((r) => requestAnimationFrame(() => r()));
}

const LOCKED_ATTRS = [
    p9r.attr.ACTION.DISABLE_DELETE,
    p9r.attr.ACTION.DISABLE_DUPLICATE,
    p9r.attr.ACTION.DISABLE_ADD_BEFORE,
    p9r.attr.ACTION.DISABLE_ADD_AFTER,
    p9r.attr.ACTION.DISABLE_CHANGE_COMPONENT,
    p9r.attr.ACTION.DISABLE_DRAGGING,
    p9r.attr.ACTION.DISABLE_SAVE_AS_TEMPLATE,
];

function buildPair(opts: { preExisting?: boolean; defaultSrc?: string; extra?: Record<string, string> } = {}) {
    const host = reset();
    const parentId = "img-parent-" + Math.random().toString(36).slice(2);
    const parent = document.createElement("div");
    parent.setAttribute(p9r.attr.EDITOR.IDENTIFIER, parentId);
    if (opts.preExisting) {
        const img = document.createElement("img");
        img.setAttribute("src", "https://example.com/pre.jpg");
        parent.appendChild(img);
    }
    host.appendChild(parent);

    const sync = new ImageSync();
    sync.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
    if (opts.defaultSrc) sync.setAttribute("default", opts.defaultSrc);
    for (const [k, v] of Object.entries(opts.extra ?? {})) sync.setAttribute(k, v);
    host.appendChild(sync);
    return { parent, sync };
}

describe("ImageSync — image is fully locked from action bar", () => {
    beforeEach(() => reset());

    test("pre-existing img gets every DISABLE_* attribute", async () => {
        const { parent } = buildPair({ preExisting: true });
        await nextFrame();

        const img = parent.querySelector("img")!;
        for (const attr of LOCKED_ATTRS) {
            expect(img.getAttribute(attr)).toBe("true");
        }
    });

    test("default-seeded img gets every DISABLE_* attribute", async () => {
        const { parent } = buildPair({ defaultSrc: "https://placehold.co/800x450" });
        await nextFrame();

        const img = parent.querySelector("img")!;
        for (const attr of LOCKED_ATTRS) {
            expect(img.getAttribute(attr)).toBe("true");
        }
    });

    test("existing editor's action-bar feature map reflects the lock after sync", async () => {
        const host = reset();
        const parentId = "img-editor-sync";
        const parent = document.createElement("div");
        parent.setAttribute(p9r.attr.EDITOR.IDENTIFIER, parentId);
        const img = document.createElement("img") as HTMLImageElement;
        img.setAttribute("src", "https://example.com/p.jpg");
        parent.appendChild(img);
        host.appendChild(parent);

        (document as any).EditorManager = {
            getEditorSystemHTMLElement: () => host,
            getBlocActionGroup: () => ({ close: () => {}, open: () => {}, setEditor: () => {} }),
        };
        const imgEditor = new SlotEditor(img);
        imgEditor.viewEditor();
        // Before sync: features were computed with no DISABLE_* attrs.
        expect([...imgEditor.features.values()].some(v => v === true)).toBe(true);

        const sync = new ImageSync();
        sync.setAttribute(p9r.attr.EDITOR.PARENT_IDENTIFIER, parentId);
        host.appendChild(sync);
        await nextFrame();

        // Every action-bar feature should now be false.
        for (const v of imgEditor.features.values()) expect(v).toBe(false);
    });

    test("lock is applied regardless of multi-select flag", async () => {
        const { parent } = buildPair({
            defaultSrc: "https://placehold.co/800x450",
            extra: { "multi-select": "" },
        });
        await nextFrame();

        const img = parent.querySelector("img")!;
        for (const attr of LOCKED_ATTRS) {
            expect(img.getAttribute(attr)).toBe("true");
        }
    });
});
