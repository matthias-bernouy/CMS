export const upgradeProperty = (host: HTMLElement, prop: string) => {
    if (Object.prototype.hasOwnProperty.call(host, prop)) {
        const value = (host as any)[prop];
        delete (host as any)[prop];
        (host as any)[prop] = value;
    }
};

export const announce = (liveRegion: HTMLElement | null, message: string) => {
    if (!liveRegion) return;
    liveRegion.textContent = '';
    window.setTimeout(() => {
        if (liveRegion) liveRegion.textContent = message;
    }, 10);
};
