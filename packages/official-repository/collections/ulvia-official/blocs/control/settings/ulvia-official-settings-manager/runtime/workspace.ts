export function initializeSettingsWorkspace(root: ShadowRoot): void {
    const mount = root.querySelector<HTMLElement>("[data-workspace]");
    if (!mount) {
        throw new Error("Missing settings workspace mount");
    }
    mount.innerHTML = `<section part="workspace" aria-labelledby="settings-title">
        <nav part="navigation" aria-label="Settings sections">
            <strong id="settings-title">Settings</strong>
            <button type="button" data-section="general" aria-current="page">General</button>
            <button type="button" data-section="languages">Languages</button>
        </nav>
        <main part="content">
            <div part="notice" data-notice role="status" aria-live="polite"></div>
            <section data-panel="general" aria-labelledby="settings-general-title">
                <header part="section-header"><div><p part="eyebrow">Site</p><h2 id="settings-general-title">General</h2><p>Identity and public availability for this CMS instance.</p></div></header>
                <form data-form="general">
                    <div part="fields">
                        <label><span>Site name</span><ulvia-official-input><input data-site-name maxlength="160" required autocomplete="organization"></ulvia-official-input><small>Displayed in Control and used as the default site identity.</small></label>
                        <label><span>Public host</span><ulvia-official-input><input data-site-host maxlength="2048" inputmode="url" placeholder="https://example.com"></ulvia-official-input><small>The canonical public origin, without a trailing path.</small></label>
                        <label><span>Site availability</span><ulvia-official-select><select data-site-visible><option value="true">Public</option><option value="false">Private</option></select></ulvia-official-select><small>Private sites remain unavailable through Delivery.</small></label>
                    </div>
                    <footer part="actions"><ulvia-official-action variant="filled" tone="primary"><button type="submit">Save general settings</button></ulvia-official-action></footer>
                </form>
            </section>
            <section data-panel="languages" aria-labelledby="settings-languages-title" hidden>
                <header part="section-header"><div><p part="eyebrow">Localization</p><h2 id="settings-languages-title">Languages</h2><p>Choose the fallback locale and the languages exposed by the site.</p></div></header>
                <form data-form="languages">
                    <div part="fields">
                        <label><span>Default language</span><ulvia-official-input><input data-language maxlength="64" required autocomplete="off"></ulvia-official-input><small>Used whenever content is not available in the requested locale.</small></label>
                        <label><span>Available languages</span><ulvia-official-tag-input max-tags="32" add-on-blur hint="Type a locale and press Enter."><input data-additional autocomplete="off"></ulvia-official-tag-input></label>
                        <label><span>Active languages</span><ulvia-official-tag-input max-tags="32" add-on-blur hint="Only active locales are exposed to visitors."><input data-active autocomplete="off"></ulvia-official-tag-input></label>
                    </div>
                    <footer part="actions"><ulvia-official-action variant="filled" tone="primary"><button type="submit">Save languages</button></ulvia-official-action></footer>
                </form>
            </section>
        </main>
    </section>`;
}
