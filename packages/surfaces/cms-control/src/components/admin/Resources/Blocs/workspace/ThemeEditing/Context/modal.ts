export type ValueControl = HTMLElement & { value: string };
type Modal = HTMLElement & { show?: () => void };

export function openModal(host: HTMLElement, selector: string): void {
    const modal = host.querySelector<Modal>(selector);
    if (typeof modal?.show === "function") {
        modal.show();
    } else {
        modal?.setAttribute("open", "");
    }
}

export function closeModal(host: HTMLElement, selector: string): void {
    host.querySelector<HTMLElement>(selector)?.removeAttribute("open");
}

export function control(host: HTMLElement, selector: string): ValueControl {
    return host.querySelector<ValueControl>(selector)!;
}

export function setText(host: HTMLElement, selector: string, value: string): void {
    const element = host.querySelector<HTMLElement>(selector);
    if (element) {
        element.textContent = value;
    }
}

export function setBusy(host: HTMLElement, busy: boolean): void {
    for (const button of Array.from(host.querySelectorAll<HTMLElement>("[data-site-variable-submit]"))) {
        button.toggleAttribute("disabled", busy);
    }
}

export function setStatus(host: HTMLElement, selector: string, message: string, error = false): void {
    const status = host.querySelector<HTMLElement>(selector);
    if (status) {
        status.textContent = message;
        status.hidden = !message;
        status.toggleAttribute("data-error", error);
    }
}
