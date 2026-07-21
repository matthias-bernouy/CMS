export const emitToggle = (host: HTMLElement, collapsed: boolean) => {
    host.dispatchEvent(
        new CustomEvent("toggle", {
            detail: { collapsed },
            bubbles: true,
            composed: true,
        }),
    );
};
