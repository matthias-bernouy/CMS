export { upgradeProperty } from "@bernouy/components/base";

export const announce = (liveRegion: HTMLElement | null, message: string) => {
    if (!liveRegion) return;
    liveRegion.textContent = '';
    window.setTimeout(() => {
        if (liveRegion) liveRegion.textContent = message;
    }, 10);
};
