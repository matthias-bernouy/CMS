import type { TemplateContent } from "email-templates/schemas/content";
import { invalid } from "email-templates/core/errors";
import { tokenPattern } from "./tokens";

type Size = { characters: number; bytes: number; startsLow?: boolean; endsHigh?: boolean };
/** Size JSON string contents without constructing escaped values or expanded bodies. */
function size(value: string, html: boolean): Size {
    let bytes = 0;
    let characters = 0;
    for (let index = 0; index < value.length; index++) {
        const code = value.charCodeAt(index);
        const escaped = html ? entities.get(code) : undefined;
        if (escaped) {
            characters += escaped;
            bytes += escaped;
            continue;
        }
        characters++;
        if (code === 34 || code === 92 || shortEscapes.has(code)) {
            bytes += 2;
        } else if (code < 32) {
            bytes += 6;
        } else if (
            code >= 0xd800 &&
            code <= 0xdbff &&
            value.charCodeAt(index + 1) >= 0xdc00 &&
            value.charCodeAt(index + 1) <= 0xdfff
        ) {
            index++;
            characters++;
            bytes += 4;
        } else if (code >= 0xd800 && code <= 0xdfff) {
            bytes += 6;
        } else {
            bytes += code < 128 ? 1 : code < 2048 ? 2 : 3;
        }
    }
    return {
        characters,
        bytes,
        startsLow: value.charCodeAt(0) >= 0xdc00 && value.charCodeAt(0) <= 0xdfff,
        endsHigh: value.charCodeAt(value.length - 1) >= 0xd800 && value.charCodeAt(value.length - 1) <= 0xdbff,
    };
}
const shortEscapes = new Set([8, 9, 10, 12, 13]);
const entities = new Map([
    [38, 5],
    [60, 4],
    [62, 4],
    [34, 6],
    [39, 5],
]);
export function assertRenderBudget(content: TemplateContent, values: ReadonlyMap<string, string>): void {
    const raw = new Map([...values].map(([name, value]) => [name, size(value, false)]));
    const html = new Map([...values].map(([name, value]) => [name, size(value, true)]));
    let bytes = Buffer.byteLength(JSON.stringify({ subject: "", text: "", ...(content.html ? { html: "" } : {}) }));
    for (const [field, maximum] of [
        ["subject", 998],
        ["text", 131072],
        ["html", 131072],
    ] as const) {
        const source = content[field];
        if (source === undefined) {
            continue;
        }
        let characters = 0;
        let endsHigh = false;
        const add = (part: Size) => {
            if (!part.characters) {
                return;
            }
            characters += part.characters;
            bytes += part.bytes - (endsHigh && part.startsLow ? 8 : 0);
            endsHigh = part.endsHigh === true;
            if (characters > maximum) {
                invalid();
            }
        };
        let offset = 0;
        for (const match of source.matchAll(tokenPattern)) {
            add(size(source.slice(offset, match.index), false));
            add((field === "html" ? html : raw).get(match[1]!) ?? { characters: 0, bytes: 0 });
            offset = match.index + match[0].length;
        }
        add(size(source.slice(offset), false));
        if (bytes > 262144) {
            invalid();
        }
    }
}
