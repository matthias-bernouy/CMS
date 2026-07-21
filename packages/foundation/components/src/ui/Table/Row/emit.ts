export const navigateRow = (host: HTMLElement) => {
    const href = host.getAttribute("href");
    if (!href) {
        return;
    }
    const target = host.getAttribute("target");

    const event = new CustomEvent("p9r-row-click", {
        detail: { href, target },
        bubbles: true,
        composed: true,
        cancelable: true,
    });
    const proceed = host.dispatchEvent(event);
    if (!proceed) {
        return;
    }

    if (target === "_blank") {
        window.open(href, "_blank", "noopener,noreferrer");
    } else {
        window.location.href = href;
    }
};
