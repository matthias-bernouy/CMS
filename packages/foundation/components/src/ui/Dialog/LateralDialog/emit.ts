export const emitOpen = (host: HTMLElement) => {
    host.dispatchEvent(new CustomEvent("open", { bubbles: true, composed: true }));
};

export const emitClose = (host: HTMLElement) => {
    host.dispatchEvent(new CustomEvent("close", { bubbles: true, composed: true }));
};
