const realFetch = globalThis.fetch;

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

export function resetDashboardActionTest(): void {
    globalThis.fetch = realFetch;
    document.head.innerHTML = "";
    document.body.replaceChildren();
}
