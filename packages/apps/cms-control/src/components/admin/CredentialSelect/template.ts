import css from "./CredentialSelect.css" with { type: "text" };
import { ICON_KEY } from "./icons";

/**
 * Builds the shadow DOM for `<cms-credential-select>`.
 *
 * Two top-layer surfaces, both browser-managed:
 *   - `.panel` uses `popover="auto"` → light-dismiss + escapes any
 *     `transform`/`overflow:hidden` ancestor (the editor's lateral
 *     dialog and admin modals both have those).
 *   - `<dialog>.create-dialog` uses `showModal()` → stacks above the
 *     parent modal, focus trap + ESC dismiss native.
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
        <dialog class="create-dialog">
            <form class="create-form" method="dialog">
                <h3 class="create-title">Create credential</h3>
                <label class="create-field">
                    <span>Key</span>
                    <input class="create-key" type="text" placeholder="MY_API_KEY" spellcheck="false" autocomplete="off">
                    <small>Uppercase letters, digits, underscore</small>
                </label>
                <label class="create-field">
                    <span>Value</span>
                    <input class="create-value" type="password" placeholder="Kept server-side" autocomplete="off">
                </label>
                <div class="create-actions">
                    <button type="button" class="create-cancel">Cancel</button>
                    <button type="button" class="create-submit">Create</button>
                </div>
            </form>
        </dialog>
    `;
    return {
        trigger:        shadow.querySelector(".trigger")        as HTMLElement,
        display:        shadow.querySelector(".value")          as HTMLElement,
        clearBtn:       shadow.querySelector(".clear-btn")      as HTMLElement,
        panel:          shadow.querySelector(".panel")          as HTMLElement,
        list:           shadow.querySelector(".list")           as HTMLElement,
        empty:          shadow.querySelector(".empty")          as HTMLElement,
        search:         shadow.querySelector(".search")         as HTMLInputElement,
        createBtn:      shadow.querySelector(".create-btn")     as HTMLElement,
        dialog:         shadow.querySelector(".create-dialog")  as HTMLDialogElement,
        dialogKey:      shadow.querySelector(".create-key")     as HTMLInputElement,
        dialogValue:    shadow.querySelector(".create-value")   as HTMLInputElement,
        dialogCancel:   shadow.querySelector(".create-cancel")  as HTMLElement,
        dialogSubmit:   shadow.querySelector(".create-submit")  as HTMLElement,
    };
}

export type Refs = ReturnType<typeof buildShadow>;
