import { describe, test, expect, beforeEach } from "bun:test";
import { TextEditor } from "cms-control/core/editorSystem/defaultEditors/TextEditor";

/**
 * DOM-level tests for `TextEditor.handlePaste`: a real `paste` ClipboardEvent
 * is dispatched on a live contenteditable target with the editor's listener
 * attached, exercising the full path (clipboard read → sanitize → insert at
 * caret). The allowlist itself is unit-tested in pasteSanitize.test.ts.
 */

// Minimal `<cms-editor-system>` stub — Editor.constructor walks up via
// `closest("cms-editor-system")` and calls `.blocActions.close()`. The tag has
// to be a real custom element (a plain div won't match), and the full
// EditorRoot pulls in heavy deps. Mirrors the stub in ImageSync.lockActions.
if (!customElements.get("cms-editor-system")) {
    customElements.define("cms-editor-system", class extends HTMLElement {
        get blocActions() {
            return { close: () => {}, open: () => {}, setEditor: () => {} };
        }
    });
}

function resetState() {
    document.body.querySelectorAll("*").forEach((n) => {
        if ((n as HTMLElement).id !== p9r.id.EDITOR_SYSTEM) n.remove();
    });
}

/** Builds an initialized TextEditor under a minimal fake <cms-editor-system>. */
function makeEditor(initialHtml = "start"): HTMLElement {
    const sys = document.createElement("cms-editor-system");
    document.body.appendChild(sys);

    const target = document.createElement("p");
    target.innerHTML = initialHtml;
    sys.appendChild(target);

    const editor = new TextEditor(target);
    editor.init();
    return target;
}

/** Places the caret at the end of `target`, then dispatches a paste event. */
function paste(target: HTMLElement, data: { html?: string; text?: string }) {
    const sel = window.getSelection()!;
    const range = document.createRange();
    range.selectNodeContents(target);
    range.collapse(false);
    sel.removeAllRanges();
    sel.addRange(range);

    const dt = new DataTransfer();
    if (data.html !== undefined) dt.setData("text/html", data.html);
    if (data.text !== undefined) dt.setData("text/plain", data.text);

    const event = new ClipboardEvent("paste", {
        clipboardData: dt,
        bubbles: true,
        cancelable: true,
    });
    target.dispatchEvent(event);
    return event;
}

describe("TextEditor.handlePaste", () => {
    beforeEach(() => resetState());

    test("attaching init() makes the target editable", () => {
        const target = makeEditor();
        expect(target.getAttribute("contenteditable")).toBe("true");
    });

    test("inserts sanitized HTML at the caret, stripping the div wrapper", () => {
        const target = makeEditor("start");
        paste(target, { html: "<div><b>bold</b> txt</div>", text: "bold txt" });
        expect(target.innerHTML).toBe("start<b>bold</b> txt");
    });

    test("falls back to plain text when the clipboard carries no HTML", () => {
        const target = makeEditor("start");
        paste(target, { text: "plain & <unsafe>" });
        // text node — the markup is rendered as text, not parsed as HTML
        expect(target.textContent).toBe("startplain & <unsafe>");
        expect(target.querySelector("unsafe")).toBeNull();
    });

    test("drops a pasted <script> but keeps the prose", () => {
        const target = makeEditor("");
        paste(target, { html: "<p>ok<script>alert(1)</script></p>", text: "ok" });
        expect(target.innerHTML).not.toContain("script");
        expect(target.textContent).toContain("ok");
    });

    test("prevents the browser default paste", () => {
        const target = makeEditor();
        const event = paste(target, { html: "<b>x</b>", text: "x" });
        expect(event.defaultPrevented).toBe(true);
    });

    test("inserts only once when text editors are nested (no double paste)", () => {
        // span/a/b/i/u are editorized as their own TextEditor. A <b> nested in a
        // <p> means two paste listeners on the bubble path; without
        // stopImmediatePropagation the clipboard gets inserted twice.
        const sys = document.createElement("cms-editor-system");
        document.body.appendChild(sys);

        const outer = document.createElement("p");
        const inner = document.createElement("b");
        inner.textContent = "x";
        outer.appendChild(inner);
        sys.appendChild(outer);

        new TextEditor(outer).init();
        new TextEditor(inner).init();

        // Caret inside the inner editor; the event bubbles to the outer one.
        paste(inner, { html: "<i>Y</i>", text: "Y" });

        expect(outer.querySelectorAll("i").length).toBe(1);
    });

    test("places the caret after the inserted content", () => {
        const target = makeEditor("start");
        paste(target, { html: "<b>X</b>", text: "X" });

        const sel = window.getSelection()!;
        // typing continues after the pasted node, not inside it
        const range = sel.getRangeAt(0);
        range.insertNode(document.createTextNode("|"));
        expect(target.innerHTML).toBe("start<b>X</b>|");
    });
});
