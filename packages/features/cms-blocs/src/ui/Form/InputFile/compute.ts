export { upgradeProperty } from "@bernouy/cms-blocs/base";

export const formatSize = (bytes: number): string => {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
};

export const announce = (liveRegion: HTMLElement | null, message: string) => {
    if (liveRegion) liveRegion.textContent = message;
};
