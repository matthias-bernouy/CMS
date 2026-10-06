export function initializeWorkspace(root: ShadowRoot): void {
    replace(
        root,
        "[data-heading]",
        `<p part="eyebrow">Provider gateway</p><h2 id="provider-manager-title">Installations and contract routing</h2><p part="intro">Control approved provider accounts and select one exact implementation for each contract.</p>`,
    );
    replace(
        root,
        "[data-header-action]",
        `<ulvia-official-action variant="outline" tone="secondary" size="sm"><button type="button" data-action="refresh">Refresh</button></ulvia-official-action>`,
    );
    replace(
        root,
        "[data-tabs]",
        `<button type="button" data-tab="installations" aria-selected="true">Installations</button><button type="button" data-tab="routing" aria-selected="false">Contract routing</button>`,
    );
    replace(
        root,
        "[data-routing-panel]",
        `<form data-routing-form><div part="routing" data-routing></div><footer part="actions"><p>Saving replaces the complete routing graph atomically.</p><ulvia-official-action variant="filled" tone="primary"><button type="submit">Save contract routing</button></ulvia-official-action></footer></form>`,
    );
}

function replace(root: ShadowRoot, selector: string, html: string): void {
    const target = root.querySelector<HTMLElement>(selector);
    if (!target) {
        throw new Error(`Missing provider workspace mount: ${selector}`);
    }
    target.innerHTML = html;
}
