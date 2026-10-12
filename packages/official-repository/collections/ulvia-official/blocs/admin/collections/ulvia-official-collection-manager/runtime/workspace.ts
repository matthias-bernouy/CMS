export function initializeWorkspace(root: ShadowRoot): void {
    replace(
        root,
        "[data-heading]",
        `
        <p part="eyebrow">Collection workspace</p>
        <h2 id="collection-manager-title">Installed foundations and releases</h2>
        <p part="intro">Review immutable versions, install repository releases and preview every migration before applying it.</p>
    `,
    );
    replace(
        root,
        "[data-header-action]",
        '<button part="refresh" type="button" data-action="refresh">Refresh</button>',
    );
    replace(
        root,
        "[data-tabs]",
        `<button type="button" data-tab="installed" aria-selected="true">Installed</button>
         <button type="button" data-tab="repository" aria-selected="false">Repository</button>
         <button type="button" data-tab="activity" aria-selected="false">Activity</button>`,
    );
    root.querySelector("[data-tabs]")?.setAttribute("aria-label", "Collection workspace sections");
    replace(
        root,
        "[data-detail-tabs]",
        `<button type="button" data-detail-tab="overview" aria-selected="true">Overview</button>
         <button type="button" data-detail-tab="theme" aria-selected="false">Theme <span data-theme-count></span></button>
         <button type="button" data-detail-tab="blocs" aria-selected="false">Blocs <span data-bloc-count></span></button>
         <button type="button" data-detail-tab="texts" aria-selected="false">Texts <span data-text-count></span></button>`,
    );
    root.querySelector("[data-detail-tabs]")?.setAttribute("aria-label", "Collection sections");
    replace(root, "[data-detail-back]", '<button type="button" data-action="back" part="back">← Collections</button>');
    replace(
        root,
        "[data-detail-heading]",
        `<p part="eyebrow">Installed collection</p>
         <h2 id="collection-detail-title" data-detail-title></h2>
         <p data-detail-description></p>`,
    );
    replace(
        root,
        "[data-installed-toolbar]",
        toolbar("Installed collections", "installed", "Filter installed collections"),
    );
    replace(root, "[data-repository-toolbar]", toolbar("Repository releases", "repository", "Search releases"));
    replace(root, "[data-activity-toolbar]", "<h3>Recent activity</h3><span data-maintenance></span>");
    replace(root, "[data-dialogs]", `${configurationDialog()}${migrationDialog()}`);
}

function toolbar(title: string, search: string, placeholder: string): string {
    return `<h3>${title}</h3><input type="search" data-search="${search}" placeholder="${placeholder}" aria-label="${placeholder}">`;
}

function configurationDialog(): string {
    return `<dialog data-configuration aria-labelledby="configuration-title">
        <form method="dialog" part="dialog-shell">
            <header><div><p part="eyebrow">Collection settings</p><h3 id="configuration-title" data-configuration-title></h3></div><button value="cancel" aria-label="Close">×</button></header>
            <label>Configuration JSON<textarea data-configuration-json rows="14" spellcheck="false"></textarea></label>
            <p data-dialog-error role="alert"></p>
            <footer><button value="cancel">Cancel</button><button value="save" data-action="save-configuration">Save configuration</button></footer>
        </form>
    </dialog>`;
}

function migrationDialog(): string {
    return `<dialog data-migration aria-labelledby="migration-title">
        <form method="dialog" part="dialog-shell">
            <header><div><p part="eyebrow">Migration preview</p><h3 id="migration-title">Review before applying</h3></div><button value="cancel" aria-label="Close">×</button></header>
            <div data-migration-summary></div>
            <p data-migration-error role="alert"></p>
            <footer><button value="cancel">Cancel</button><button value="apply" data-action="apply-migration">Apply migration</button></footer>
        </form>
    </dialog>`;
}

function replace(root: ShadowRoot, selector: string, html: string): void {
    const target = root.querySelector<HTMLElement>(selector);
    if (!target) {
        throw new Error(`Missing collection workspace mount: ${selector}`);
    }
    target.innerHTML = html;
}
