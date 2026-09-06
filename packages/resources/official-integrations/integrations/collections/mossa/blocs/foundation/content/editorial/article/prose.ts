const marker = "data-mossa-article-prose";

export function installArticleProse(host: HTMLElement): void {
    const root = host.getRootNode() as Document | ShadowRoot;
    if ((root !== host.ownerDocument && !("host" in root)) || root.querySelector(`style[${marker}]`)) {
        return;
    }
    const style = host.ownerDocument.createElement("style");
    style.setAttribute(marker, "");
    // Assigned prose remains in the light DOM, beyond the reach of ::slotted selectors.
    style.textContent = `mossa-article :where(a[href]) {
        color: var(--ulvia-secondary-base);
        text-underline-offset: 0.15em;
    }
    mossa-article :where(a[href]):focus-visible {
        outline: 2px solid currentColor;
        outline-offset: 2px;
    }`;
    (root === host.ownerDocument ? host.ownerDocument.head : root).append(style);
}
