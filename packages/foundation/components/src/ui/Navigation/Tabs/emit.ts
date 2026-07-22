export const emitChange = (host: HTMLElement, active: string) => {
    host.dispatchEvent(new CustomEvent("change", { bubbles: true, detail: { active } }));
};
