import { collectAncestorExtensions } from "src/control/core/editorSystem/extensions/collectAncestors";
import type { RichTextBarExtension } from "src/control/core/editorSystem/extensions/types";
import type { RichTextBar } from "../RichTextBar";
import { buildBraceButton, buildGroup } from "./render";
import { pickField } from "./pick";

/**
 * Refreshes the bar's extensions slot from the current caret position.
 *
 * UI model: ONE generic `{ }` button on the bar (when ≥1 extension is scoped),
 * which toggles a popover grouping every available completion by extension.
 * Scales to many extensions without bloating the bar itself.
 *
 * Caches per editable element to skip the ancestor walk on every keystroke
 * (selectionchange fires on every keystroke).
 */
export function refreshExtensions(self: RichTextBar): void {
    const range = self.selection.range ?? window.getSelection()?.getRangeAt(0) ?? null;
    if (!range) return clear(self);
    const startEl = (range.startContainer.nodeType === Node.ELEMENT_NODE
        ? range.startContainer
        : range.startContainer.parentElement) as Element | null;
    if (!startEl) return clear(self);

    if (self._lastEditable === startEl) return;
    self._lastEditable = startEl;

    const exts = collectAncestorExtensions(startEl, "richtextbar")
        .filter(e => e.enabled?.() !== false);
    self._currentExtensions = exts;
    render(self, exts);
}

export function closeCompletions(self: RichTextBar): void {
    const popover = self.shadowRoot?.getElementById("completions");
    if (popover) popover.hidden = true;
}

function clear(self: RichTextBar): void {
    self._lastEditable = null;
    self._currentExtensions = [];
    self.shadowRoot!.getElementById("extensions")!.replaceChildren();
    (self.shadowRoot!.querySelector(".ext-separator") as HTMLElement).style.display = "none";
    closeCompletions(self);
}

function render(self: RichTextBar, exts: RichTextBarExtension[]): void {
    const slot = self.shadowRoot!.getElementById("extensions")!;
    const sep  = self.shadowRoot!.querySelector(".ext-separator") as HTMLElement;
    if (exts.length === 0) {
        slot.replaceChildren();
        sep.style.display = "none";
        return;
    }
    sep.style.display = "";
    slot.replaceChildren(buildBraceButton((anchor) => toggle(self, anchor)));
}

function toggle(self: RichTextBar, anchor: HTMLElement): void {
    const popover = self.shadowRoot!.getElementById("completions")!;
    if (!popover.hidden) { closeCompletions(self); return; }
    popover.replaceChildren();
    const exts = self._currentExtensions;
    if (exts.length === 0) {
        popover.innerHTML = `<div class="ext-empty">No completions available.</div>`;
    } else {
        for (const ext of exts) popover.appendChild(buildGroup(ext, (f) => {
            pickField(self, ext, f);
            closeCompletions(self);
        }));
    }
    // First commit at anchor's offset, then shift left if it'd overflow the
    // viewport right edge (no horizontal page scroll on most editor layouts —
    // popover is non-scrollable container, must fit on screen).
    popover.style.left = `${anchor.offsetLeft}px`;
    popover.hidden = false;
    clampPopoverToViewport(self, popover);
}

const VIEWPORT_MARGIN = 8;

function clampPopoverToViewport(self: RichTextBar, popover: HTMLElement): void {
    const rect = popover.getBoundingClientRect();
    const overflowRight = rect.right - (window.innerWidth - VIEWPORT_MARGIN);
    if (overflowRight > 0) {
        const current = parseFloat(popover.style.left) || 0;
        popover.style.left = `${current - overflowRight}px`;
    }
    // Never push the popover off the left edge — anchor offset is already ≥ 0
    // inside the bar; the bar itself is clamped by `show()` so the bar's left
    // is ≥ VIEWPORT_MARGIN. Recheck after the right-shift in case the bar is
    // narrower than the popover.
    const after = popover.getBoundingClientRect();
    const barRect = self.getBoundingClientRect();
    const minLeftWithinBar = VIEWPORT_MARGIN - barRect.left;
    if (after.left < VIEWPORT_MARGIN) {
        popover.style.left = `${minLeftWithinBar}px`;
    }
}
