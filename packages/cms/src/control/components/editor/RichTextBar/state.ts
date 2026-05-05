/**
 * UI-state refresh: turns the bar's buttons "active"/"inactive" based on the
 * caret's current formatting context, and keeps the size + color readouts
 * in sync. Pure DOM reads/writes — no command application here, that's
 * `actions.ts`.
 */
import { getCurrentColor, getCurrentFontSize, getExistingLink, queryCommandState } from "./commands";
import type { RichTextBar } from "./RichTextBar";

const FORMAT_COMMANDS = ["bold", "italic", "underline", "strikeThrough"] as const;
const ALIGN_COMMANDS = ["justifyLeft", "justifyCenter", "justifyRight"] as const;
const ACTIVE_COMMANDS = [...FORMAT_COMMANDS, ...ALIGN_COMMANDS];

export function updateState(self: RichTextBar): void {
    for (const cmd of ACTIVE_COMMANDS) {
        const btn = self.shadowRoot!.querySelector(`button[data-command="${cmd}"]`);
        if (btn) btn.classList.toggle("active", queryCommandState(cmd));
    }
    const linkBtn = self.shadowRoot!.querySelector('[data-action="link"]');
    if (linkBtn) linkBtn.classList.toggle("active", !!getExistingLink(self.selection.range));
    updateSizeDisplay(self);
    updateColorState(self);
}

export function updateSizeDisplay(self: RichTextBar, size?: number): void {
    const display = self.shadowRoot!.querySelector(".size-display");
    if (display) display.textContent = String(size ?? getCurrentFontSize());
}

export function updateColorState(self: RichTextBar): void {
    const trigger = self.shadowRoot!.querySelector(".color-swatch-current") as HTMLElement | null;
    if (!trigger) return;
    const color = getCurrentColor();
    if (color) trigger.style.background = color;
}
