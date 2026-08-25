import { syncFormValue } from "./compute";

export const handleChange = (host: HTMLElement, input: HTMLInputElement | null, internals: ElementInternals) => {
    const isChecked = input?.checked ?? false;
    if (isChecked) {
        host.setAttribute("checked", "");
    } else {
        host.removeAttribute("checked");
    }

    syncFormValue(host, input, internals);
    host.dispatchEvent(new Event("change", { bubbles: true, composed: true }));
};

export const handleClick = (host: HTMLElement, e: Event) => {
    if (host.hasAttribute("disabled")) {
        e.preventDefault();
        e.stopImmediatePropagation();
    }
};
