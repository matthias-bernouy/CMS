import resolveApiUrl from "src/control/core/dom/meta/resolveApiUrl";
import css from "./TemplatePicker.style.css" with { type: "text" };

const ICON = `<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/><path d="M9 21V9"/></svg>`;

type TemplateItem = { id: string; name: string; category: string };

/**
 * `<cms-template-picker>` — first-load layout selector. Auto-fetches
 * settings + templates filtered by `system.editor.layoutCategory` and
 * resolves with the picked template's HTML (or `null` if skipped / no
 * candidate). Lighter than the BlocLibrary's locked mode: a single
 * column of horizontal cards, native `<dialog>` for the modal.
 */
export class TemplatePicker extends HTMLElement {

    private _dialog: HTMLDialogElement | null = null;
    private _resolve: ((html: string | null) => void) | null = null;

    constructor() {
        super();
        this.attachShadow({ mode: "open" }).innerHTML = `<style>${css}</style>`;
    }

    /** Fetch + show. Returns the picked template's HTML, or `null`. */
    async open(): Promise<string | null> {
        const category = await this._fetchLayoutCategory();
        if (!category) return null;
        const templates = await this._fetchTemplates(category);
        if (templates.length === 0) return null;

        this._render(templates);
        return new Promise<string | null>(resolve => { this._resolve = resolve; });
    }

    private async _fetchLayoutCategory(): Promise<string | null> {
        try {
            const res = await fetch(resolveApiUrl("system/settings"));
            if (!res.ok) return null;
            const data = await res.json() as { editor?: { layoutCategory?: string } };
            return data?.editor?.layoutCategory || null;
        } catch { return null; }
    }

    private async _fetchTemplates(category: string): Promise<TemplateItem[]> {
        try {
            const res = await fetch(resolveApiUrl("template/list"));
            if (!res.ok) return [];
            const all = await res.json() as TemplateItem[];
            return all.filter(t => t.category === category);
        } catch { return []; }
    }

    private async _fetchContent(id: string): Promise<string | null> {
        try {
            const res = await fetch(resolveApiUrl(`template?id=${encodeURIComponent(id)}`));
            if (!res.ok) return null;
            const tpl = await res.json() as { content?: string };
            return tpl.content ?? null;
        } catch { return null; }
    }

    private _render(items: TemplateItem[]) {
        const dialog = document.createElement("dialog");
        dialog.innerHTML = `
            <div class="head">
                <div class="title">Pick a starting template</div>
                <div class="subtitle">Choose a layout for your new page, or start from scratch.</div>
            </div>
            <div class="list">
                ${items.map(t => `
                    <button type="button" class="card" data-id="${t.id}">
                        <span class="icon">${ICON}</span>
                        <span class="name">${escapeHtml(t.name)}</span>
                    </button>
                `).join("")}
            </div>
            <div class="foot">
                <button type="button" class="skip">Start from scratch</button>
            </div>
        `;
        dialog.querySelectorAll<HTMLButtonElement>(".card").forEach(btn => {
            btn.addEventListener("click", () => this._pick(btn.dataset.id!));
        });
        dialog.querySelector(".skip")!.addEventListener("click", () => this._close(null));
        dialog.addEventListener("cancel", () => this._close(null));
        // Backdrop click — native <dialog> doesn't dismiss on backdrop click;
        // when the click target is the dialog itself (not its content) the
        // user clicked the backdrop area.
        dialog.addEventListener("click", (e) => { if (e.target === dialog) this._close(null); });

        this.shadowRoot!.appendChild(dialog);
        this._dialog = dialog;
        dialog.showModal();
    }

    private async _pick(id: string) {
        const html = await this._fetchContent(id);
        this._close(html);
    }

    private _close(html: string | null) {
        this._dialog?.close();
        this._dialog?.remove();
        this._dialog = null;
        const r = this._resolve;
        this._resolve = null;
        r?.(html);
    }
}

function escapeHtml(s: string): string {
    return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");
}

if (!customElements.get("cms-template-picker")) {
    customElements.define("cms-template-picker", TemplatePicker);
}
