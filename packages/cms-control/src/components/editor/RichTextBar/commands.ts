/**
 * Pure rich-text command functions — no component state, no UI wiring.
 * They operate on `window.getSelection()` and mutate the DOM in place.
 *
 * The element uses these from event handlers; tests can call them directly
 * against a fake selection.
 */

/** Element of the current selection's focus node, or `null`. */
function focusElement(): HTMLElement | null {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return null;
    const node = sel.focusNode;
    if (!node) return null;
    return node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
}

/** Wraps the current non-collapsed selection with `wrapper` and re-selects it. */
export function wrapWithElement(wrapper: HTMLElement) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;
    const range = sel.getRangeAt(0);
    if (range.collapsed) return;

    try {
        const contents = range.extractContents();
        wrapper.appendChild(contents);
        range.insertNode(wrapper);

        sel.removeAllRanges();
        const newRange = document.createRange();
        newRange.selectNodeContents(wrapper);
        sel.addRange(newRange);
    } catch (e) {
        console.warn("Selection spans complex markup", e);
    }
}

/**
 * If the selection is inside an existing `<tag>`, unwrap it; otherwise wrap
 * the selection in a fresh `<tag>`.
 */
export function toggleFormat(tag: string) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0) return;

    const el = focusElement();
    const existingTag = el?.closest(tag);

    if (existingTag) {
        const parent = existingTag.parentNode;
        const frag = document.createDocumentFragment();
        while (existingTag.firstChild) {
            frag.appendChild(existingTag.firstChild);
        }

        const firstNode = frag.firstChild;
        const lastNode = frag.lastChild;
        parent?.replaceChild(frag, existingTag);

        if (firstNode && lastNode) {
            const newRange = document.createRange();
            newRange.setStartBefore(firstNode);
            newRange.setEndAfter(lastNode);
            sel.removeAllRanges();
            sel.addRange(newRange);
        }
    } else {
        wrapWithElement(document.createElement(tag));
    }
}

/** Sets `text-align` on the closest block ancestor of the selection. */
export function applyBlockAlignment(align: string) {
    const el = focusElement();
    const block = el?.closest("p, div, h1, h2, h3, h4, h5, h6, li") as HTMLElement | null;
    if (block) block.style.textAlign = align;
}

/**
 * Applies an inline CSS prop to the selection. If the focused element is a
 * `<span>` that exactly matches the selected text, mutate it in place;
 * otherwise wrap in a new `<span>`.
 */
export function applyInlineStyle(prop: string, value: string) {
    const sel = window.getSelection();
    if (!sel || sel.rangeCount === 0 || sel.isCollapsed) return;

    const el = focusElement();
    if (el && el.tagName === "SPAN" && el.textContent === sel.toString()) {
        (el.style as any)[prop] = value;
        return;
    }

    const span = document.createElement("span");
    (span.style as any)[prop] = value;
    wrapWithElement(span);
}

/** Removes a CSS prop from the closest `<span>`, unwrapping if it becomes empty. */
export function removeInlineStyle(prop: string) {
    const el = focusElement();
    const span = el?.closest("span");
    if (!span) return;

    (span.style as any)[prop] = "";
    if (span.style.length === 0) {
        const parent = span.parentNode;
        while (span.firstChild) parent?.insertBefore(span.firstChild, span);
        parent?.removeChild(span);
    }
}

/** Read-only check used by the toolbar to highlight active buttons. */
export function queryCommandState(cmd: string): boolean {
    const el = focusElement();
    if (!el) return false;

    const style = window.getComputedStyle(el);
    switch (cmd) {
        case "bold": return style.fontWeight === "bold" || parseInt(style.fontWeight) >= 700 || !!el.closest("b, strong");
        case "italic": return style.fontStyle === "italic" || !!el.closest("i, em");
        case "underline": return style.textDecorationLine.includes("underline") || !!el.closest("u");
        case "strikeThrough": return style.textDecorationLine.includes("line-through") || !!el.closest("s, strike");
        case "justifyLeft": return style.textAlign === "left" || style.textAlign === "start";
        case "justifyCenter": return style.textAlign === "center";
        case "justifyRight": return style.textAlign === "right";
        default: return false;
    }
}

/** Current font-size of the focused element, rounded to an integer px. */
export function getCurrentFontSize(): number {
    const el = focusElement();
    if (!el) return 16;
    return Math.round(parseFloat(window.getComputedStyle(el).fontSize));
}

/** Current computed text color of the focused element, or `null`. */
export function getCurrentColor(): string | null {
    const el = focusElement();
    if (!el) return null;
    return window.getComputedStyle(el).color;
}

/**
 * Replaces the contenteditable block containing the selection with a fresh
 * `<ul>`/`<ol>` containing a single `<li>`, and focuses the `<li>`.
 */
export function insertList(tag: "ul" | "ol") {
    const selection = window.getSelection();
    if (!selection || selection.rangeCount === 0) return;

    const el = focusElement();
    if (!el) return;

    const editable = el.closest("[contenteditable]") as HTMLElement | null;
    if (!editable) return;

    const list = document.createElement(tag);
    const li = document.createElement("li");
    list.appendChild(li);
    editable.replaceWith(list);

    selection.removeAllRanges();
    const newRange = document.createRange();
    newRange.selectNodeContents(li);
    selection.addRange(newRange);
}

/** Wraps the selection in `<a href>`. */
export function applyLinkUrl(url: string) {
    if (!url) return;
    const a = document.createElement("a");
    a.href = url;
    wrapWithElement(a);
}

/** Unwraps the `<a>` ancestor of the selection, if any. */
export function removeLinkAtSelection() {
    const el = focusElement();
    const a = el?.closest("a");
    if (!a) return;

    const parent = a.parentNode;
    while (a.firstChild) parent?.insertBefore(a.firstChild, a);
    parent?.removeChild(a);
}

/**
 * Returns the `href` of the `<a>` ancestor of `range` (or the current
 * selection), or `null` if none.
 */
export function getExistingLink(range: Range | null): string | null {
    const r = range || window.getSelection()?.getRangeAt(0);
    if (!r) return null;

    const node = r.startContainer;
    const el = node.nodeType === 1 ? (node as HTMLElement) : node.parentElement;
    return el?.closest("a")?.getAttribute("href") || null;
}
