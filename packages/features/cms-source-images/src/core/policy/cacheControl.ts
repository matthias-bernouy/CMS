const CACHE_DIRECTIVE_NAME = /^[!#$%&'*+\-.^_`|~0-9a-z]+$/;

export function parseCacheDirectives(value: string | null): Map<string, string | true> | null {
    const result = new Map<string, string | true>();
    const rawDirectives = splitCacheDirectives(value);
    if (!rawDirectives) {
        return null;
    }
    for (const raw of rawDirectives) {
        const separator = raw.indexOf("=");
        const rawName = (separator < 0 ? raw : raw.slice(0, separator)).trim();
        const name = rawName.toLowerCase();
        if (!CACHE_DIRECTIVE_NAME.test(name)) {
            return null;
        }
        if ((name === "max-age" || name === "s-maxage") && result.has(name)) {
            return null;
        }
        if (separator < 0) {
            result.set(name, true);
            continue;
        }
        const parsedValue = parseDirectiveValue(raw.slice(separator + 1).trim());
        if (parsedValue === null) {
            return null;
        }
        result.set(name, parsedValue);
    }
    return result;
}

export function nonNegativeInteger(value: string | null): number | undefined {
    if (value === null || !/^\d+$/.test(value)) {
        return undefined;
    }
    const parsed = Number(value);
    return Number.isSafeInteger(parsed) && parsed >= 0 ? parsed : undefined;
}

function splitCacheDirectives(value: string | null): string[] | null {
    if (value === null) {
        return [];
    }
    const directives: string[] = [];
    let start = 0;
    let quoted = false;
    let escaped = false;
    for (let index = 0; index < value.length; index += 1) {
        const character = value[index]!;
        if (escaped) {
            escaped = false;
            continue;
        }
        if (quoted && character === "\\") {
            escaped = true;
            continue;
        }
        if (character === '"') {
            quoted = !quoted;
            continue;
        }
        if (!quoted && character === ",") {
            const directive = value.slice(start, index).trim();
            if (!directive) {
                return null;
            }
            directives.push(directive);
            start = index + 1;
        }
    }
    if (quoted || escaped) {
        return null;
    }
    const last = value.slice(start).trim();
    if (!last) {
        return value.trim() ? null : [];
    }
    directives.push(last);
    return directives;
}

function parseDirectiveValue(raw: string): string | null {
    if (!raw) {
        return null;
    }
    if (!raw.startsWith('"')) {
        return raw.includes('"') ? null : raw;
    }
    if (raw.length < 2 || !raw.endsWith('"')) {
        return null;
    }
    let value = "";
    for (let index = 1; index < raw.length - 1; index += 1) {
        const character = raw[index]!;
        if (character === '"') {
            return null;
        }
        if (character !== "\\") {
            value += character;
            continue;
        }
        index += 1;
        if (index >= raw.length - 1) {
            return null;
        }
        value += raw[index]!;
    }
    return value;
}
