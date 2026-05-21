// Global UX glue (no custom element): surface <w13c-form> failures inside
// the parent <p9r-modal> (or as a body-level alert) so users see the server
// message instead of a silent 4xx in the network tab.

function friendlyMessage(detail: any): string {
    if (!detail) return "An error occurred.";
    const body = detail.body;
    if (body && typeof body === "object" && body.error) {
        const e = body.error;
        return `${e.code || "error"}: ${e.message || ""}`.trim();
    }
    return `HTTP ${detail.status ?? "?"}`;
}

function ensureAlert(host: Element): HTMLElement {
    let a = host.querySelector(":scope > p9r-alert.hub-form-error") as HTMLElement | null;
    if (!a) {
        a = document.createElement("p9r-alert");
        a.setAttribute("type", "error");
        a.classList.add("hub-form-error");
        host.appendChild(a);
    }
    return a;
}

document.addEventListener("form:failed", (ev: any) => {
    const form = ev.target;
    if (!(form instanceof Element)) return;
    const host = form.closest("p9r-modal") || form.closest("dialog") || form.parentElement || document.body;
    ensureAlert(host).textContent = friendlyMessage(ev.detail);
});

document.addEventListener("form:success", (ev: any) => {
    const form = ev.target;
    if (!(form instanceof Element)) return;
    const host = form.closest("p9r-modal") || form.parentElement;
    host?.querySelector(":scope > p9r-alert.hub-form-error")?.remove();
});
