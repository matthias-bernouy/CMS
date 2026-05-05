/**
 * User-facing actions invoked from the click router (`listener.handleClick`).
 * Each action snapshots/restores the saved selection around the DOM mutation
 * (`commands.ts` calls operate on `window.getSelection()`, which a click on
 * a button would otherwise collapse) and refreshes whatever UI state changed.
 */
import {
    applyBlockAlignment,
    applyInlineStyle,
    applyLinkUrl,
    getCurrentFontSize,
    getExistingLink,
    insertList,
    removeInlineStyle,
    removeLinkAtSelection,
    toggleFormat,
} from "./commands";
import { updateColorState, updateSizeDisplay, updateState } from "./state";
import type { RichTextBar } from "./RichTextBar";

// ── Format ──────────────────────────────────────────────────────────────

export function runCommand(cmd: string): void {
    switch (cmd) {
        case "bold":          return toggleFormat("b");
        case "italic":        return toggleFormat("i");
        case "underline":     return toggleFormat("u");
        case "strikeThrough": return toggleFormat("s");
        case "justifyLeft":   return applyBlockAlignment("left");
        case "justifyCenter": return applyBlockAlignment("center");
        case "justifyRight":  return applyBlockAlignment("right");
    }
}

// ── Size ────────────────────────────────────────────────────────────────

export function changeSize(self: RichTextBar, delta: number): void {
    self.selection.restore();
    const next = Math.max(8, Math.min(96, getCurrentFontSize() + delta));
    applyInlineStyle("fontSize", `${next}px`);
    self.selection.save();
    updateSizeDisplay(self, next);
}

// ── Color panel ─────────────────────────────────────────────────────────

export function toggleColorPanel(self: RichTextBar): void {
    const panel = self.shadowRoot!.querySelector(".color-panel") as HTMLElement;
    const isOpen = panel.classList.toggle("open");
    closeLinkBar(self);
    if (isOpen) placeColorPanel(self, panel);
}

/**
 * The panel defaults to opening above the trigger (`bottom: 100%`). When
 * the bar sits near the top of the viewport that flips the panel
 * off-screen and clips its top row of swatches; flip to `top: 100%`
 * (open below the trigger) when there isn't enough headroom.
 */
function placeColorPanel(self: RichTextBar, panel: HTMLElement): void {
    const trigger = self.shadowRoot!.querySelector(".color-trigger") as HTMLElement;
    if (!trigger) return;
    const gap = 8;
    const triggerRect = trigger.getBoundingClientRect();
    const panelHeight = panel.offsetHeight;
    panel.classList.toggle("below", triggerRect.top < panelHeight + gap);
}

export function applyColor(self: RichTextBar, color: string): void {
    self.selection.restore();
    if (color === "inherit") {
        removeInlineStyle("color");
    } else {
        applyInlineStyle("color", color);
    }
    self.selection.save();
    self.shadowRoot!.querySelector(".color-panel")!.classList.remove("open");
    updateColorState(self);
}

// ── Link bar ────────────────────────────────────────────────────────────

export function toggleLinkBar(self: RichTextBar): void {
    const bar = self.shadowRoot!.querySelector(".link-bar")!;
    const isOpen = bar.classList.contains("open");

    self.shadowRoot!.querySelector(".color-panel")?.classList.remove("open");

    if (isOpen) {
        closeLinkBar(self);
        return;
    }

    const existing = getExistingLink(self.selection.range);
    const input = self.shadowRoot!.querySelector(".link-input") as HTMLInputElement;
    input.value = existing || "";

    if (self.pageLink && existing) {
        (self.pageLink as any).value = existing;
    }

    bar.classList.add("open");
}

export function closeLinkBar(self: RichTextBar): void {
    self.shadowRoot!.querySelector(".link-bar")?.classList.remove("open");
}

export function switchLinkType(self: RichTextBar, type: string): void {
    const root = self.shadowRoot!;
    root.querySelectorAll(".link-type-btn").forEach(btn =>
        btn.classList.toggle("active", (btn as HTMLElement).dataset.linkType === type));

    root.querySelectorAll<HTMLElement>(".link-field").forEach(f => {
        f.style.display = f.dataset.linkField === type ? "" : "none";
    });
}

export function applyLink(self: RichTextBar): void {
    self.selection.restore();

    const activeType = self.shadowRoot!.querySelector(".link-type-btn.active") as HTMLElement;
    const type = activeType?.dataset.linkType || "external";

    let url = "";
    if (type === "external") {
        url = (self.shadowRoot!.querySelector(".link-input") as HTMLInputElement).value.trim();
    } else if (type === "internal" && self.pageLink) {
        url = (self.pageLink as any).value || "";
    }

    applyLinkUrl(url);

    self.selection.save();
    closeLinkBar(self);
    updateState(self);
}

export function removeLink(self: RichTextBar): void {
    self.selection.restore();
    removeLinkAtSelection();
    self.selection.save();
    closeLinkBar(self);
    updateState(self);
}

// ── List ────────────────────────────────────────────────────────────────

export function insertListAction(self: RichTextBar, tag: "ul" | "ol"): void {
    self.selection.restore();
    insertList(tag);
    self.hide();
}
