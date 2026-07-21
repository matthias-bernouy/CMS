import css from "./CredentialSelect.css" with { type: "text" };
import { ICON_KEY } from "./icons";

/**
 * Builds the shadow DOM for `<cms-credential-select>`.
 *
 * The `.panel` dropdown uses `popover="auto"` → light-dismiss + escapes
 * any `transform`/`overflow:hidden` ancestor (the editor's lateral
 * dialog and admin modals both have those). The create form is NOT here:
 * it lives in a body-level `<p9r-modal>` built in `dialog.ts` so it
 * escapes the editor's transformed subtree and centres on the viewport.
 */
export function buildShadow(host: HTMLElement, label: string | null) {
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
        <style>${css}</style>
        <div class="field">
            ${label ? `<span class="label">${label}</span>` : ""}
            <div class="input-row">
                <button class="trigger" type="button" tabindex="0">
                    ${ICON_KEY}
                    <span class="value">No credential</span>
                    <svg class="chevron" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
                        stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
                        <path d="m6 9 6 6 6-6"/>
                    </svg>
                </button>
                <button class="clear-btn" type="button" title="Remove credential">
                    <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
                        stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
        </div>
        <div class="panel" popover="auto">
            <button type="button" class="create-btn">+ Create new credential</button>
            <div class="search-wrap"><input class="search" type="text" placeholder="Search credentials..." spellcheck="false"></div>
            <ul class="list"></ul>
            <div class="empty">No credentials yet</div>
        </div>
    `;
    return {
        trigger: shadow.querySelector(".trigger") as HTMLElement,
        display: shadow.querySelector(".value") as HTMLElement,
        clearBtn: shadow.querySelector(".clear-btn") as HTMLElement,
        panel: shadow.querySelector(".panel") as HTMLElement,
        list: shadow.querySelector(".list") as HTMLElement,
        empty: shadow.querySelector(".empty") as HTMLElement,
        search: shadow.querySelector(".search") as HTMLInputElement,
        createBtn: shadow.querySelector(".create-btn") as HTMLElement,
    };
}

export type Refs = ReturnType<typeof buildShadow>;
