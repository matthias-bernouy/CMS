export function xmlEscape(value: string): string {
    return value
        .replace(/&/g, "&amp;")
        .replace(/</g, "&lt;")
        .replace(/>/g, "&gt;")
        .replace(/"/g, "&quot;")
        .replace(/'/g, "&apos;");
}

export function decodeXml(value: string): string {
    return value
        .replace(/&lt;/g, "<")
        .replace(/&gt;/g, ">")
        .replace(/&quot;/g, "\"")
        .replace(/&apos;/g, "'")
        .replace(/&amp;/g, "&");
}

export function xmlTag(source: string, tag: string): string {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`<${escaped}>(.*?)</${escaped}>`, "s"));
    return decodeXml(match?.[1] ?? "");
}

export function xmlAttr(source: string, tag: string, attr: string): string {
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const escapedAttr = attr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    const match = source.match(new RegExp(`<${escapedTag}\\b[^>]*\\b${escapedAttr}="([^"]*)"`, "s"));
    return decodeXml(match?.[1] ?? "");
}

export function xmlAttributes(source: string, tag: string): Array<Record<string, string>> {
    const escapedTag = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return Array.from(source.matchAll(new RegExp(`<${escapedTag}\\b([^>]*)>`, "g"))).map(match => {
        const attrs: Record<string, string> = {};
        for (const attr of (match[1] ?? "").matchAll(/\b([A-Za-z0-9_:-]+)="([^"]*)"/g)) {
            if (attr[1]) attrs[attr[1]] = decodeXml(attr[2] ?? "");
        }
        return attrs;
    });
}

export function xmlBlocks(source: string, tag: string): string[] {
    const escaped = tag.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
    return Array.from(source.matchAll(new RegExp(`<${escaped}>(.*?)</${escaped}>`, "gs")))
        .map(match => match[1] ?? "");
}
