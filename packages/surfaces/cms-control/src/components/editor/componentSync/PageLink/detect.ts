import { mediaIdFromUrl } from "@bernouy/cms-files/urls";

export function isExternal(v: string): boolean {
    return /^(https?:|mailto:|tel:|\/\/)/i.test(v);
}

export function isMedia(v: string): boolean {
    return mediaIdFromUrl(v) !== null;
}

export function mediaLabel(src: string): string {
    const id = mediaIdFromUrl(src);
    return id ? `Media ${id}` : src;
}
