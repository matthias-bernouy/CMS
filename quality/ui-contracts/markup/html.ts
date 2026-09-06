import type { MarkupFragment, MarkupTag } from "./types";

const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes"]);

/** A start-tag scanner, not an HTML tree builder. It preserves original source positions. */
export function markupTags(fragment: MarkupFragment): MarkupTag[] {
    const tags: MarkupTag[] = [];
    const { content, positions } = fragment;
    let cursor = 0;
    while (cursor < content.length) {
        const start = content.indexOf("<", cursor);
        if (start < 0) {
            break;
        }
        if (content.startsWith("<!--", start)) {
            const end = content.indexOf("-->", start + 4);
            cursor = end < 0 ? content.length : end + 3;
            continue;
        }
        if (/^<!|^<\?/.test(content.slice(start, start + 2))) {
            cursor = tagEnd(content, start + 2) + 1;
            continue;
        }
        const name = /^<([a-zA-Z][\w:-]*)\b/.exec(content.slice(start));
        if (!name) {
            cursor = start + 1;
            continue;
        }
        const end = tagEnd(content, start + name[0].length);
        if (end >= content.length) {
            break;
        }
        const tag: MarkupTag = {
            name: name[1]!.toLowerCase(),
            offset: positions[start] ?? start,
            attributes: new Map(),
        };
        let index = start + name[0].length;
        while (index < end) {
            while (/[\s/]/.test(content[index] ?? "") && index < end) {
                index++;
            }
            const attr = /^[^\s=/>]+/.exec(content.slice(index, end));
            if (!attr) {
                index++;
                continue;
            }
            const offset = positions[index] ?? index;
            const key = attr[0].toLowerCase();
            index += attr[0].length;
            while (/\s/.test(content[index] ?? "") && index < end) {
                index++;
            }
            let value = "";
            if (content[index] === "=") {
                index++;
                while (/\s/.test(content[index] ?? "") && index < end) {
                    index++;
                }
                const quote = content[index];
                if (quote === '"' || quote === "'") {
                    const begin = ++index;
                    while (index < end && content[index] !== quote) {
                        index++;
                    }
                    value = content.slice(begin, index++);
                } else {
                    const begin = index;
                    while (index < end && !/\s/.test(content[index]!)) {
                        index++;
                    }
                    value = content.slice(begin, index);
                }
            }
            // HTML keeps the first duplicate attribute; later values are not runtime evidence.
            if (!tag.attributes.has(key)) {
                tag.attributes.set(key, { value: decodeEntities(value), offset });
            }
        }
        tags.push(tag);
        cursor = end + 1;
        if (tag.name === "plaintext") {
            break;
        }
        if (RAW_TEXT.has(tag.name)) {
            const close = new RegExp(`</${tag.name}\\s*>`, "ig");
            close.lastIndex = cursor;
            const match = close.exec(content);
            cursor = match ? close.lastIndex : content.length;
        }
    }
    return tags;
}

function tagEnd(content: string, start: number): number {
    let quote = "";
    for (let index = start; index < content.length; index++) {
        const char = content[index]!;
        if (quote) {
            if (char === quote) {
                quote = "";
            }
        } else if (char === '"' || char === "'") {
            quote = char;
        } else if (char === ">") {
            return index;
        }
    }
    return content.length;
}

function decodeEntities(value: string): string {
    const named: Record<string, string> = {
        amp: "&",
        quot: '"',
        apos: "'",
        lt: "<",
        gt: ">",
        Tab: "\t",
        NewLine: "\n",
    };
    return value.replace(/&(#x[\da-f]+|#\d+|amp|quot|apos|lt|gt|Tab|NewLine);/gi, (match, entity: string) => {
        if (!entity.startsWith("#")) {
            return named[entity] ?? match;
        }
        const point = entity[1]?.toLowerCase() === "x" ? parseInt(entity.slice(2), 16) : Number(entity.slice(1));
        return point > 0 && point <= 0x10ffff ? String.fromCodePoint(point) : "\uFFFD";
    });
}
