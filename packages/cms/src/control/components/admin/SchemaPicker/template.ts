import css from "./SchemaPicker.css" with { type: "text" };

const ICON = `
<svg class="icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
    <path d="M21 12a9 9 0 0 1-9 9m9-9a9 9 0 0 0-9-9m9 9H3m9 9a9 9 0 0 1-9-9m9 9c2.49-2.7 3.9-6.3 3.9-9 0-2.7-1.41-6.3-3.9-9m0 18c-2.49-2.7-3.9-6.3-3.9-9 0-2.7 1.41-6.3 3.9-9m-9 9a9 9 0 0 1 9-9"/>
</svg>
`;

const CHEVRON = `
<svg class="chevron" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5"
    stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
    <path d="m6 9 6 6 6-6"/>
</svg>
`;

const CLEAR = `
<svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2"
    stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
    <line x1="18" y1="6" x2="6" y2="18"/>
    <line x1="6" y1="6" x2="18" y2="18"/>
</svg>
`;

/**
 * Builds the shadow DOM for `<cms-schema-picker>`. Top-layer popover —
 * same approach as `<cms-credential-select>` to escape modals + scoped
 * stacking contexts.
 */
export function buildShadow(host: HTMLElement, label: string | null) {
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
        <style>${css}</style>
        <div class="field">
            ${label ? `<span class="label">${label}</span>` : ""}
            <div class="input-row">
                <button class="trigger" type="button" tabindex="0">
                    ${ICON}
                    <span class="method"></span>
                    <span class="value">Select endpoint</span>
                    ${CHEVRON}
                </button>
                <button class="clear-btn" type="button" title="Clear selection">${CLEAR}</button>
            </div>
        </div>
        <div class="panel" popover="auto">
            <div class="provider-row">
                <label>Provider</label>
                <select class="provider-select"></select>
            </div>
            <div class="search-wrap"><input class="search" type="text" placeholder="Search endpoints..." spellcheck="false"></div>
            <ul class="list"></ul>
            <div class="empty">No endpoints — sync the provider first.</div>
        </div>
    `;
    return {
        trigger:        shadow.querySelector(".trigger")         as HTMLElement,
        triggerMethod:  shadow.querySelector(".trigger .method") as HTMLElement,
        triggerValue:   shadow.querySelector(".trigger .value")  as HTMLElement,
        clearBtn:       shadow.querySelector(".clear-btn")       as HTMLElement,
        panel:          shadow.querySelector(".panel")           as HTMLElement,
        providerSelect: shadow.querySelector(".provider-select") as HTMLSelectElement,
        search:         shadow.querySelector(".search")          as HTMLInputElement,
        list:           shadow.querySelector(".list")            as HTMLElement,
        empty:          shadow.querySelector(".empty")           as HTMLElement,
    };
}

export type Refs = ReturnType<typeof buildShadow>;
