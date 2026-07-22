import { afterEach } from "bun:test";

const realFetch = globalThis.fetch;

export function setupDashboardActionTests(): void {
    if (!customElements.get("p9r-toast-stack")) {
        customElements.define(
            "p9r-toast-stack",
            class extends HTMLElement {
                push(message: string): HTMLElement {
                    const toast = document.createElement("p9r-toast");
                    toast.textContent = message;
                    this.append(toast);
                    return toast;
                }
            },
        );
    }

    afterEach(() => {
        globalThis.fetch = realFetch;
        window.location.href = "http://localhost:4999/cms/admin/editor";
        document.head.innerHTML = "";
        document.body.replaceChildren();
    });
}
