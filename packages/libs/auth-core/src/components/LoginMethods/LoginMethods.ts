/**
 * `<cms-login-methods base>` — fetches `GET <base>/auth/methods` and renders a
 * button for each **redirect-style** provider (Google, OIDC…), linking to its
 * `loginUrl` (carrying the current `returnTo`). Credential-style providers
 * (local email/password) are handled by the page's own form, not here. Renders
 * nothing when there is no redirect provider.
 */
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
        const rt = returnTo ? `?returnTo=${encodeURIComponent(returnTo)}` : "";

        try {
            const res = await fetch(`${base}/auth/methods`);
            const methods: Array<{ displayName: string; loginUrl?: string }> = res.ok ? await res.json() : [];
            const redirect = methods.filter((m) => m.loginUrl);
            if (!redirect.length) return;
            wrap.innerHTML = `<div class="sep">or</div>` + redirect.map((m) =>
                `<a class="provider" href="${escapeAttr(m.loginUrl!)}${rt}">${escapeText(m.displayName)}</a>`).join("");
        } catch {
            /* no providers shown on failure */
        }
    }
}

const escapeAttr = (s: string) => s.replace(/&/g, "&amp;").replace(/"/g, "&quot;");
const escapeText = (s: string) => s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");

customElements.define("cms-login-methods", CmsLoginMethods);
