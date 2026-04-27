export const emitChange = (host: HTMLElement, value: string) => {
    host.dispatchEvent(new CustomEvent('change', { bubbles: true, detail: { value } }));
};
