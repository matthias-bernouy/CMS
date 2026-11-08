import { blocStylePaintProperty } from "./paint";

export type BlocStyleWrite = Readonly<{ name?: string; value?: string }>;

const STYLE = String.raw`(?:\.\s*style|\[\s*["']style["']\s*\])`;
const SET_PROPERTY = new RegExp(
    `${STYLE}\\s*(?:\\??\\.\\s*setProperty|(?:\\?\\.)?\\[\\s*["']setProperty["']\\s*\\])\\s*(?:\\?\\.)?\\s*\\(`,
    "gu",
);
const DIRECT_WRITE = new RegExp(
    `${STYLE}\\s*(?:\\.\\s*([\\w$]+)|\\[([^\\]]+)\\])?\\s*(?:=(?!=)|\\+=|\\|\\|=|\\?\\?=)`,
    "gu",
);

/** Recognized style channels only: this authoring policy is not a JavaScript sandbox. */
export function forbiddenStyleWriteIssues(source: string): readonly string[] {
    const issues: string[] = [];
    const code = codeOffsets(source);
    if (
        [...source.matchAll(DIRECT_WRITE)].some((match) => {
            const property = match[1] ?? literal(match[2]);
            return (
                code[match.index!] &&
                (!property || property === "cssText" || property.startsWith("--") || blocStylePaintProperty(property))
            );
        }) ||
        matchesCode(
            source,
            /\.\s*setAttribute(?:NS)?\s*\(\s*(?:null\s*,\s*)?["'`](?:style|fill|stroke|color|bgcolor|stop-color|flood-color|lighting-color)["'`]/u,
            code,
        ) ||
        /<[^>]+\sstyle\s*=/iu.test(source) ||
        /<style(?:\s|>)/iu.test(source) ||
        matchesCode(
            source,
            /\bcreateElement\s*\(\s*["'`]style["'`]|\bCSSStyleSheet\b|\.\s*(?:insertRule|addRule|replaceSync)\s*\(/iu,
            code,
        ) ||
        matchesCode(source, new RegExp(`Object\\s*\\.\\s*assign\\s*\\([^,]*${STYLE}\\s*,`, "u"), code)
    ) {
        issues.push(
            "direct paint/style replacement, stylesheet injection and paint attributes are forbidden; select CSS states or owned custom properties",
        );
    }
    if (blocStyleWrites(source).some((write) => !write.name?.startsWith("--"))) {
        issues.push("style.setProperty requires a static custom-property name; put native styling in Bloc CSS");
    }
    return issues;
}

export function blocStyleWrites(source: string): readonly BlocStyleWrite[] {
    const writes: BlocStyleWrite[] = [];
    const code = codeOffsets(source);
    for (const match of source.matchAll(SET_PROPERTY)) {
        if (!code[match.index!]) {
            continue;
        }
        const argumentsList = callArguments(source, match.index! + match[0].length);
        writes.push({ name: literal(argumentsList[0]), value: literal(argumentsList[1]) });
    }
    return writes;
}

function matchesCode(source: string, pattern: RegExp, code: Uint8Array): boolean {
    const flags = pattern.flags.includes("g") ? pattern.flags : `${pattern.flags}g`;
    return [...source.matchAll(new RegExp(pattern.source, flags))].some((match) => code[match.index!]);
}

/** Ignore ordinary quoted text and comments; keep templates visible to recognize embedded writes. */
function codeOffsets(source: string): Uint8Array {
    const code = new Uint8Array(source.length);
    let quote = "";
    let comment = "";
    for (let index = 0; index < source.length; index++) {
        const character = source[index]!;
        const next = source[index + 1];
        if (comment) {
            if (comment === "//" && character === "\n") {
                comment = "";
            } else if (comment === "/*" && character === "*" && next === "/") {
                comment = "";
                index++;
            }
        } else if (quote) {
            if (character === "\\") {
                index++;
            } else if (character === quote) {
                quote = "";
            }
        } else if (character === "/" && (next === "/" || next === "*")) {
            comment = character + next;
            index++;
        } else if ("\"'".includes(character)) {
            quote = character;
        } else {
            code[index] = 1;
        }
    }
    return code;
}

function literal(source: string | undefined): string | undefined {
    const text = source?.trim();
    if (!text || !/^["'`]/u.test(text) || text.at(-1) !== text[0] || text.includes("${")) {
        return undefined;
    }
    if (text[0] === '"') {
        try {
            const result: unknown = JSON.parse(text);
            return typeof result === "string" ? result : undefined;
        } catch {
            return undefined;
        }
    }
    // Escaped literals are deliberately unsupported rather than decoded inconsistently.
    return text.slice(1, -1).includes("\\") ? undefined : text.slice(1, -1);
}

/** Split bounded source arguments without truncating strings, templates or nested expressions. */
function callArguments(source: string, start: number): string[] {
    const result: string[] = [];
    let depth = 0;
    let quote = "";
    let offset = start;
    for (let index = start; index < source.length; index++) {
        const character = source[index]!;
        if (quote) {
            if (character === "\\") {
                index++;
            } else if (character === quote) {
                quote = "";
            }
            continue;
        }
        if ("\"'`".includes(character)) {
            quote = character;
        } else if ("([{".includes(character)) {
            depth++;
        } else if (character === ")" && depth === 0) {
            result.push(source.slice(offset, index));
            return result;
        } else if (")]}".includes(character)) {
            depth--;
        } else if (character === "," && depth === 0) {
            result.push(source.slice(offset, index));
            offset = index + 1;
        }
    }
    return result;
}
