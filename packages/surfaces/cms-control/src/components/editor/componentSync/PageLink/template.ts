import css from "./PageLink.css" with { type: "text" };

export function buildShadow(host: HTMLElement, label: string | null) {
    const shadow = host.attachShadow({ mode: "open" });
    shadow.innerHTML = `
        <style>${css}</style>
        <div class="field">
            ${label ? `<span class="label">${label}</span>` : ""}
            <div class="input-row">
                <button class="trigger" type="button" tabindex="0">
                    <svg class="link-icon" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
                        <path d="M10 13a5 5 0 0 0 7.54.54l3-3a5 5 0 0 0-7.07-7.07l-1.72 1.71"/>
                        <path d="M14 11a5 5 0 0 0-7.54-.54l-3 3a5 5 0 0 0 7.07 7.07l1.71-1.71"/>
                    </svg>
                    <span class="value">No link</span>
                    <svg class="chevron" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
                        <path d="m6 9 6 6 6-6"/>
                    </svg>
                </button>
                <button class="clear-btn" type="button" title="Remove link">
                    <svg viewBox="0 0 24 24" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" width="14" height="14" fill="none">
                        <line x1="18" y1="6" x2="6" y2="18"/>
                        <line x1="6" y1="6" x2="18" y2="18"/>
                    </svg>
                </button>
            </div>
            <div class="panel">
                <div class="tabs">
                    <button type="button" class="tab tab-page" data-mode="page">Page</button>
                    <button type="button" class="tab tab-external" data-mode="external">External URL</button>
                    <button type="button" class="tab tab-media" data-mode="media">Media</button>
                </div>
                <div class="page-section">
                    <div class="search-wrap"><input class="search" type="text" placeholder="Search for a page..."></div>
                    <ul class="list"></ul>
                    <div class="empty">No pages found</div>
                </div>
                <div class="external-section"><input class="external-input" type="url" placeholder="https://example.com" spellcheck="false"></div>
                <div class="media-section">
                    <button type="button" class="media-pick-btn">Choose a media file…</button>
                    <div class="media-current"></div>
                </div>
            </div>
        </div>
        <div hidden><slot></slot></div>
    `;
    return {
        trigger: shadow.querySelector(".trigger") as HTMLElement,
        display: shadow.querySelector(".value") as HTMLElement,
        list: shadow.querySelector(".list") as HTMLElement,
        panel: shadow.querySelector(".panel") as HTMLElement,
        empty: shadow.querySelector(".empty") as HTMLElement,
        clearBtn: shadow.querySelector(".clear-btn") as HTMLElement,
        pageSection: shadow.querySelector(".page-section") as HTMLElement,
        externalSection: shadow.querySelector(".external-section") as HTMLElement,
        mediaSection: shadow.querySelector(".media-section") as HTMLElement,
        externalInput: shadow.querySelector(".external-input") as HTMLInputElement,
        mediaPickBtn: shadow.querySelector(".media-pick-btn") as HTMLElement,
        mediaCurrent: shadow.querySelector(".media-current") as HTMLElement,
        tabPage: shadow.querySelector(".tab-page") as HTMLElement,
        tabExternal: shadow.querySelector(".tab-external") as HTMLElement,
        tabMedia: shadow.querySelector(".tab-media") as HTMLElement,
        search: shadow.querySelector(".search") as HTMLInputElement,
    };
}

export type Refs = ReturnType<typeof buildShadow>;
