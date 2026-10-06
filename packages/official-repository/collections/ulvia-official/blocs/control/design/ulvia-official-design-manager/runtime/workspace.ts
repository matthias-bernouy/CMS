export function initializeWorkspace(root: ShadowRoot): void {
    replace(
        root,
        "[data-heading]",
        `<p part="eyebrow">Design system</p><h2 id="design-manager-title">Languages, theme and collection texts</h2><p part="intro">Edit site-owned configuration while collection releases remain immutable.</p>`,
    );
    replace(
        root,
        "[data-header-action]",
        `<ulvia-official-action variant="outline" tone="secondary" size="sm"><button type="button" data-action="refresh">Refresh</button></ulvia-official-action>`,
    );
    replace(
        root,
        "[data-tabs]",
        `<button type="button" data-tab="languages" aria-selected="true">Languages</button><button type="button" data-tab="theme" aria-selected="false">Theme source</button><button type="button" data-tab="texts" aria-selected="false">Collection texts</button>`,
    );
    replace(root, "[data-languages]", languages());
    replace(root, "[data-theme-panel]", theme());
    replace(root, "[data-texts-panel]", texts());
}

function languages(): string {
    return `<form data-form="languages">
        <div part="field"><label for="design-language">Default language</label><ulvia-official-input><input id="design-language" data-language required maxlength="64" autocomplete="off"></ulvia-official-input><small>The fallback locale used when no translated value exists.</small></div>
        <div part="field"><label for="design-additional">Available languages</label><ulvia-official-tag-input max-tags="32" add-on-blur hint="Type a locale and press Enter."><input id="design-additional" data-additional type="text" autocomplete="off"></ulvia-official-tag-input></div>
        <div part="field"><label for="design-active">Active languages</label><ulvia-official-tag-input max-tags="32" add-on-blur hint="Only active locales are exposed to visitors."><input id="design-active" data-active type="text" autocomplete="off"></ulvia-official-tag-input></div>
        <footer part="actions"><ulvia-official-action variant="filled" tone="primary"><button type="submit">Save languages</button></ulvia-official-action></footer>
    </form>`;
}

function theme(): string {
    return `<form data-form="theme">
        <div part="field"><label for="design-theme">Structured theme JSON</label><ulvia-official-textarea show-count><textarea id="design-theme" data-theme rows="18" required spellcheck="false"></textarea></ulvia-official-textarea><small data-theme-meta></small></div>
        <footer part="actions"><ulvia-official-action variant="filled" tone="primary"><button type="submit">Validate and save theme</button></ulvia-official-action></footer>
    </form>`;
}

function texts(): string {
    return `<form data-form="load-texts" part="text-selector">
        <div part="field"><label for="design-collection">Collection</label><ulvia-official-select><select id="design-collection" data-collection required></select></ulvia-official-select></div>
        <div part="field"><label for="design-locale">Locale</label><ulvia-official-input><input id="design-locale" data-locale maxlength="64" autocomplete="off"></ulvia-official-input></div>
        <ulvia-official-action variant="outline" tone="secondary"><button type="submit">Load catalogue</button></ulvia-official-action>
    </form>
    <form data-form="texts">
        <div part="field"><label for="design-overrides">Site override JSON</label><ulvia-official-textarea show-count><textarea id="design-overrides" data-overrides rows="14" required spellcheck="false" disabled></textarea></ulvia-official-textarea><small data-text-meta>Select and load a collection catalogue first.</small></div>
        <div part="text-items" data-text-items></div>
        <footer part="actions"><ulvia-official-action variant="filled" tone="primary"><button type="submit" data-save-texts disabled>Validate and save overrides</button></ulvia-official-action></footer>
    </form>`;
}

function replace(root: ShadowRoot, selector: string, html: string): void {
    const target = root.querySelector<HTMLElement>(selector);
    if (!target) {
        throw new Error(`Missing design workspace mount: ${selector}`);
    }
    target.innerHTML = html;
}
