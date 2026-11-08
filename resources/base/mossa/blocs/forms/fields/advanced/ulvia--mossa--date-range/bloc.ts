import { observeBlocAttributes } from "@bernouy/content/browser";
import { recentRange, validRange } from "./runtime/range";

export function mount(root: HTMLElement): () => void {
    const picker = root.querySelector<HTMLDetailsElement>("details");
    const from = root.querySelector<HTMLInputElement>("[data-range-from]");
    const to = root.querySelector<HTMLInputElement>("[data-range-to]");
    const summary = root.querySelector<HTMLElement>("[data-range-summary]");
    const error = root.querySelector<HTMLElement>("[data-range-error]");
    if (!picker || !from || !to || !summary || !error) {
        return () => {};
    }
    const sync = (): void => {
        const range = validRange(root.getAttribute("from") ?? "", root.getAttribute("to") ?? "") ?? recentRange(15);
        from.value = range.from.slice(0, 16);
        to.value = range.to.slice(0, 16);
        const format = new Intl.DateTimeFormat(document.documentElement.lang || "en", {
            month: "short",
            day: "numeric",
            hour: "2-digit",
            minute: "2-digit",
            timeZone: "UTC",
        });
        summary.textContent = `${format.format(new Date(range.from))} – ${format.format(new Date(range.to))} UTC`;
    };
    const click = (event: Event): void => {
        const button = (event.target as Element).closest<HTMLButtonElement>("button");
        if (!button) {
            return;
        }
        const minutes = Number(button.dataset.minutes);
        const range = button.hasAttribute("data-minutes")
            ? recentRange(minutes)
            : button.hasAttribute("data-range-apply")
              ? validRange(`${from.value}Z`, `${to.value}Z`)
              : null;
        if (!range) {
            error.hidden = false;
            return;
        }
        error.hidden = true;
        root.setAttribute("from", range.from);
        root.setAttribute("to", range.to);
        sync();
        picker.open = false;
        root.dispatchEvent(new CustomEvent("date-range-change", { bubbles: true, detail: range }));
    };
    const keydown = (event: KeyboardEvent): void => {
        if (event.key === "Escape" && picker.open) {
            picker.open = false;
            picker.querySelector("summary")?.focus();
        }
    };
    sync();
    root.addEventListener("click", click);
    root.addEventListener("keydown", keydown);
    const stop = observeBlocAttributes(root, ["from", "to"], sync);
    return () => {
        stop();
        root.removeEventListener("click", click);
        root.removeEventListener("keydown", keydown);
    };
}
