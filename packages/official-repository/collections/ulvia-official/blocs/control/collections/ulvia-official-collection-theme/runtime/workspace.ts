export function initializeThemeWorkspace(root: ShadowRoot): void {
    const mount = root.querySelector<HTMLElement>("[data-workspace]");
    if (!mount) {
        throw new Error("Missing collection theme workspace mount");
    }
    mount.innerHTML = `<section part="workspace" aria-label="Collection theme editor">
        <div part="notice" data-notice role="status" aria-live="polite"></div>
        <header part="toolbar">
            <div part="profile"><label for="theme-profile">Theme profile</label><ulvia-official-select><select id="theme-profile" data-profile></select></ulvia-official-select></div>
            <div part="mode" role="group" aria-label="Theme mode"><button type="button" data-mode="light" aria-pressed="true">Light</button><button type="button" data-mode="dark" aria-pressed="false">Dark</button></div>
            <div part="actions"><span data-status></span><ulvia-official-action variant="outline" tone="secondary" size="sm"><button type="button" data-action="activate">Activate theme</button></ulvia-official-action></div>
        </header>
        <div part="empty" data-empty hidden><h3>No theme tokens</h3><p>This collection does not publish a theme catalogue.</p></div>
        <div part="editor" data-editor hidden>
            <nav part="token-navigation" aria-label="Theme token categories"><label for="theme-token-search">Search tokens</label><input id="theme-token-search" type="search" data-search placeholder="Search tokens"><div data-categories></div></nav>
            <main part="preview" data-preview></main>
            <aside part="inspector" data-inspector></aside>
        </div>
    </section>`;
}
