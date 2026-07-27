/** Renders redirect-style login providers on the Control login page. */
class CmsLoginMethods extends HTMLElement {
    async connectedCallback() {
        const base = this.getAttribute("base") ?? "";
        const root = this.shadowRoot ?? this.attachShadow({ mode: "open" });
        root.innerHTML = `
        <style>
          .sep { display: flex; align-items: center; gap: .75rem; color: var(--text-muted, #999); font-size: .8rem; margin: 1rem 0; }
          .sep::before, .sep::after { content: ""; flex: 1; height: 1px; background: var(--border-default, #ddd); }
          a.provider { display: block; text-align: center; padding: .6rem; margin-top: .5rem; text-decoration: none;
                       border: 1px solid var(--border-default, #ddd); border-radius: var(--radius-sm, 6px);
                       color: var(--text-main, #111); background: var(--bg-surface, #fff); }
          a.provider:hover { background: var(--bg-base, #f6f6f6); }
        </style>
        <div class="methods"></div>`;

        const wrap = root.querySelector(".methods")!;
        const returnTo = new URL(location.href).searchParams.get("returnTo") ?? "";
        const suffix = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";

        try {
            const response = await fetch(`${base}/auth/methods`);
            const methods: Array<{ displayName: string; loginUrl?: string }> = response.ok ? await response.json() : [];
            const redirectMethods = methods.filter((method) => method.loginUrl);
            if (!redirectMethods.length) {
                return;
            }
            wrap.innerHTML =
                `<div class="sep">or</div>` +
                redirectMethods
                    .map(
                        (method) =>
                            `<a class="provider" href="${escapeHtml(method.loginUrl!)}${suffix}">${escapeHtml(method.displayName)}</a>`,
                    )
                    .join("");
        } catch {
            // The local login form remains available when providers cannot load.
        }
    }
}

function escapeHtml(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&#39;");
}

customElements.define("cms-login-methods", CmsLoginMethods);
