export function initializePageEditor(root: ShadowRoot): void {
    const mount = root.querySelector<HTMLElement>("[data-workspace]");
    if (!mount) {
        throw new Error("Missing Page editor workspace mount");
    }
    mount.innerHTML = `<section part="editor" aria-labelledby="page-editor-title">
        <header part="header">
            <div><p part="eyebrow">Page builder</p><h3 id="page-editor-title">Page document</h3><p>Compose the page from the Blocs installed on this site. Changes remain a draft until publication.</p></div>
            <button type="button" data-save>Save document</button>
        </header>
        <p part="notice" data-notice role="status" aria-live="polite"></p>
        <div part="workspace">
            <aside part="panel catalogue" aria-labelledby="catalogue-title">
                <h4 id="catalogue-title">Add a Bloc</h4>
                <input type="search" data-search placeholder="Search Blocs" autocomplete="off">
                <div part="catalogue-list" data-catalogue></div>
            </aside>
            <main part="panel structure" aria-labelledby="structure-title">
                <h4 id="structure-title">Document structure</h4>
                <div part="empty" data-empty>No elements yet. Add a Bloc to start.</div>
                <ol data-outline></ol>
            </main>
            <aside part="panel inspector" aria-labelledby="inspector-title">
                <h4 id="inspector-title">Selected element</h4>
                <div data-inspector-empty>Select an element to edit it.</div>
                <div data-inspector hidden>
                    <strong data-selected-label></strong>
                    <label>Element content<textarea data-element-content rows="10" spellcheck="false"></textarea></label>
                    <div data-settings></div>
                    <div part="element-actions">
                        <button type="button" data-move="-1" aria-label="Move selected element up">Move up</button>
                        <button type="button" data-move="1" aria-label="Move selected element down">Move down</button>
                        <button type="button" data-duplicate>Duplicate</button>
                        <button type="button" data-remove data-danger>Remove</button>
                    </div>
                </div>
            </aside>
        </div>
        <section part="preview-section" aria-labelledby="preview-title">
            <h4 id="preview-title">Draft preview</h4>
            <iframe data-preview title="Page document preview" sandbox=""></iframe>
        </section>
        <details part="source">
            <summary>Advanced document source</summary>
            <label>HTML document<textarea data-source rows="14" maxlength="1048576" spellcheck="false"></textarea></label>
            <button type="button" data-apply-source>Apply source to draft</button>
        </details>
    </section>`;
}
