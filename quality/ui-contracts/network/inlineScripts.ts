export type ScriptExcerpt = { content: string; offset: number };

const JAVASCRIPT_TYPES = new Set([
    "module",
    "text/javascript",
    "application/javascript",
    "text/ecmascript",
    "application/ecmascript",
    "application/x-javascript",
    "application/x-ecmascript",
    "text/jscript",
    "text/livescript",
    "text/x-javascript",
    "text/x-ecmascript",
    "text/javascript1.0",
    "text/javascript1.1",
    "text/javascript1.2",
    "text/javascript1.3",
    "text/javascript1.4",
    "text/javascript1.5",
]);
const RAW_TEXT = new Set(["script", "style", "textarea", "title", "xmp", "iframe", "noembed", "noframes", "noscript"]);

function executable(attributes: string): boolean {
    const values = new Map<string, string>();
    const attribute = /([^\s"'<>/=]+)(?:\s*=\s*(?:"([^"]*)"|'([^']*)'|([^\s"'=<>`]+)))?/g;
    for (const match of attributes.matchAll(attribute)) {
        const name = match[1]!.toLowerCase();
        if (!values.has(name)) {
            values.set(name, match[2] ?? match[3] ?? match[4] ?? "");
        }
    }
    if (values.has("src")) {
        return false;
    }
    const type = values.get("type")?.trim().toLowerCase();
    if (type !== undefined) {
        return type === "" || JAVASCRIPT_TYPES.has(type);
    }
    const language = values.get("language")?.trim().toLowerCase();
    return !language || JAVASCRIPT_TYPES.has(`text/${language}`);
}

/** Read inline script bodies without interpreting inert HTML as JavaScript. */
export function inlineScripts(html: string): ScriptExcerpt[] {
    const excerpts: ScriptExcerpt[] = [];
    const tags = /<!--[\s\S]*?(?:-->|$)|<(\/?)([a-z][\w:-]*)((?:"[^"]*"|'[^']*'|[^'">])*)>/gi;
    let templateDepth = 0;
    for (let match = tags.exec(html); match; match = tags.exec(html)) {
        const name = match[2]?.toLowerCase();
        if (!name) {
            continue;
        }
        const closing = match[1] === "/";
        if (name === "template") {
            templateDepth = Math.max(0, templateDepth + (closing ? -1 : 1));
        }
        if (closing) {
            continue;
        }
        if (name === "plaintext") {
            break;
        }
        if (!RAW_TEXT.has(name)) {
            continue;
        }
        const endTag = new RegExp(`</${name}\\s*>`, "gi");
        endTag.lastIndex = tags.lastIndex;
        const end = endTag.exec(html);
        if (!end) {
            break;
        }
        if (name === "script" && templateDepth === 0 && executable(match[3]!)) {
            excerpts.push({ content: html.slice(tags.lastIndex, end.index), offset: tags.lastIndex });
        }
        tags.lastIndex = endTag.lastIndex;
    }
    return excerpts;
}
