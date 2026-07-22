import { getOptions, updateSliderPosition, updateSlottedSelections } from "./compute";

interface SwitchHost extends HTMLElement {
    value: string;
    disabled: boolean;
}

export const syncOptions = (host: SwitchHost, slot: HTMLSlotElement | null) => {
    const options = getOptions(slot);
    host.style.setProperty("--total-options", options.length.toString());

    options.forEach((opt, i) => {
        opt.setAttribute("role", "radio");
        opt.setAttribute("part", "segment");
        if (!opt.hasAttribute("tabindex")) {
            opt.setAttribute("tabindex", i === 0 ? "0" : "-1");
        }
        (opt as HTMLElement).onclick = () => {
            if (host.disabled) {
                return;
            }
            host.value = opt.getAttribute("value") ?? "";
            (opt as HTMLElement).focus();
        };
    });

    updateSliderPosition(host, options, host.value);
    updateSlottedSelections(options, host.value);
};

export const handleKeydown = (host: SwitchHost, slot: HTMLSlotElement | null, e: KeyboardEvent) => {
    if (host.disabled) {
        return;
    }
    const keys = ["ArrowLeft", "ArrowRight", "ArrowUp", "ArrowDown", "Home", "End"];
    if (!keys.includes(e.key)) {
        return;
    }

    const options = getOptions(slot);
    if (options.length === 0) {
        return;
    }

    const currentIndex = options.findIndex((opt) => opt.getAttribute("value") === host.value);
    const fallback = currentIndex === -1 ? 0 : currentIndex;
    let nextIndex = fallback;

    switch (e.key) {
        case "ArrowLeft":
        case "ArrowUp":
            nextIndex = (fallback - 1 + options.length) % options.length;
            break;
        case "ArrowRight":
        case "ArrowDown":
            nextIndex = (fallback + 1) % options.length;
            break;
        case "Home":
            nextIndex = 0;
            break;
        case "End":
            nextIndex = options.length - 1;
            break;
    }

    e.preventDefault();
    const next = options[nextIndex];
    if (!next) {
        return;
    }
    host.value = next.getAttribute("value") ?? "";
    (next as HTMLElement).focus();
};
