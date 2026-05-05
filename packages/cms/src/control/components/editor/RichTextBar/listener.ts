/**
 * Event handlers wired by `RichTextBar.connectedCallback`. Click router
 * (`handleClick`) dispatches to `actions.ts`; selection-driven show/hide
 * and outside-click detection live here.
 */
import {
    applyColor,
    applyLink,
    changeSize,
    insertListAction,
    removeLink,
    runCommand,
    switchLinkType,
    toggleColorPanel,
    toggleLinkBar,
} from "./actions";
import { updateState } from "./state";
import type { RichTextBar } from "./RichTextBar";

export function handleClick(self: RichTextBar, e: MouseEvent): void {
    const target = e.target as HTMLElement;
    const btn = target.closest("button") as HTMLElement | null;
    if (!btn) return;

    const command = btn.dataset.command;
    if (command) {
        self.selection.restore();
        runCommand(command);
        self.selection.save();
        updateState(self);
        return;
    }

    const action = btn.dataset.action;
    if (action === "size-up")   return changeSize(self, 2);
    if (action === "size-down") return changeSize(self, -2);
    if (action === "color")     return toggleColorPanel(self);
    if (action === "link")      return toggleLinkBar(self);
    if (action === "list-ul")   return insertListAction(self, "ul");
    if (action === "list-ol")   return insertListAction(self, "ol");

    const color = btn.dataset.color;
    if (color !== undefined) return applyColor(self, color);

    const linkType = btn.dataset.linkType;
    if (linkType) return switchLinkType(self, linkType);

    if (btn.classList.contains("link-apply"))  return applyLink(self);
    if (btn.classList.contains("link-unlink")) return removeLink(self);
}

export function handleSelection(self: RichTextBar): void {
    if (self.interacting) return;

    const activeEl = self.shadowRoot!.activeElement;
    if (activeEl && (activeEl.tagName === "INPUT" || activeEl.tagName.includes("-"))) {
        return;
    }

    const sel = window.getSelection();
    if (!sel || sel.isCollapsed || sel.toString().trim() === "") {
        self.hide();
        return;
    }

    const rect = sel.getRangeAt(0).getBoundingClientRect();
    self.selection.save();
    self.show(rect);
    updateState(self);
}

export function handleRootMousedown(self: RichTextBar, e: Event): void {
    const target = e.target as HTMLElement;
    self.interacting = true;
    if (target.tagName === "INPUT" || target.tagName.includes("-") || target.closest("p9r-link")) {
        return;
    }
    e.preventDefault();
}

export function handleRootMouseup(self: RichTextBar): void {
    setTimeout(() => { self.interacting = false; }, 50);
}

/**
 * The bar lives in the editor system's shadow DOM, so by the time the
 * mousedown reaches the document its `target` has been retargeted to
 * the editor host — `self.contains(target)` always reports false even
 * when the click was on one of our own buttons. `composedPath()` keeps
 * the original cross-shadow path, so it's the only reliable way to
 * recognise our own clicks (or clicks inside the active contenteditable)
 * here.
 */
export function handleOutsideMouseDown(self: RichTextBar, e: MouseEvent): void {
    if (!self.classList.contains("visible")) return;
    const path = e.composedPath();
    if (path.includes(self) || path.includes(self.shadowRoot!)) return;

    const range = self.selection.range;
    if (range) {
        const anchor = range.commonAncestorContainer;
        const el = anchor.nodeType === 1 ? anchor as Element : anchor.parentElement;
        const editable = el?.closest?.('[contenteditable="true"]') as HTMLElement | null;
        if (editable && path.includes(editable)) return;
    }
    self.hide();
}
