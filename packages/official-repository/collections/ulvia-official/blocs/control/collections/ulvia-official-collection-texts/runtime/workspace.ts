export function initializeTextsWorkspace(root: ShadowRoot): void {
    const mount = root.querySelector<HTMLElement>("[data-workspace]");
    if (!mount) {
        throw new Error("Missing collection text workspace mount");
    }
    mount.innerHTML = `<section part="workspace" aria-label="Collection text editor">
        <div part="notice" data-notice role="status" aria-live="polite"></div>
        <header part="toolbar">
            <div><label for="text-locale">Translation language</label><ulvia-official-select><select id="text-locale" data-locale></select></ulvia-official-select></div>
            <div><label for="text-search">Search texts</label><input id="text-search" type="search" data-search placeholder="Search labels and keys"></div>
            <ulvia-official-action variant="filled" tone="primary"><button type="button" data-action="save">Save translations</button></ulvia-official-action>
        </header>
        <div part="empty" data-empty hidden><h3>No collection texts</h3><p>This collection does not publish translatable text resources.</p></div>
        <div part="editor" data-editor hidden>
            <nav part="navigation" aria-label="Text groups" data-groups></nav>
            <main part="catalogue"><header><div><p part="eyebrow" data-category></p><h3 data-group-title></h3></div><p><span data-count></span> text resources</p></header><form data-form="texts"><div data-items></div></form></main>
        </div>
    </section>`;
}
