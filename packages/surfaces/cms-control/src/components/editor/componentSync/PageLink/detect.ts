import { parseCmsFilesByIdUrl } from "@bernouy/cms-files/urls";

export function isExternal(v: string): boolean {
    return /^(https?:|mailto:|tel:|\/\/)/i.test(v);
}

export function isMedia(v: string): boolean {
    return parseCmsFilesByIdUrl(v) !== null;
}

export function mediaLabel(src: string): string {
    const parsed = parseCmsFilesByIdUrl(src);
    return parsed ? `Media ${parsed.id}` : src;
}
