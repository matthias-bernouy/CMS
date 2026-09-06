import type { AvailabilityView } from "./blocks";
import { button, element } from "./dom";

export function renderSaveBar(root: ShadowRoot, availability?: AvailabilityView, busy = false): void {
    const target = root.querySelector<HTMLElement>("[data-save-bar]")!;
    target.replaceChildren();
    if (!availability?.dirty) {
        return;
    }
    const bar = element("section", "save-bar");
    bar.setAttribute("aria-label", "Unsaved collection changes");
    const message = element("div");
    message.append(
        element("strong", "", `${availability.dirty} unsaved ${availability.dirty === 1 ? "change" : "changes"}`),
        element("small", "", "Choose the blocs available in the editor. Existing pages are preserved."),
    );
    const cancel = button("Discard", "discard-availability", "button quiet");
    const save = button(busy ? "Saving…" : "Save changes", "save-availability", "button primary");
    cancel.disabled = save.disabled = busy;
    bar.append(message, cancel, save);
    target.append(bar);
}
