export function isExternal(v: string): boolean {
    return /^(https?:|mailto:|tel:|\/\/)/i.test(v);
}

export function isMedia(v: string): boolean {
    return /(^|\/)media\?id=/.test(v);
}

export function mediaLabel(src: string): string {
    const m = src.match(/id=([^&]+)/);
    return m ? `Media ${m[1]}` : src;
}
