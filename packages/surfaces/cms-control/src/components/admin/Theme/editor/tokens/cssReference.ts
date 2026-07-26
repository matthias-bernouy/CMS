export type DirectTokenReference = {
    variable: string;
    fallback?: string;
};

export function parseDirectTokenReference(value: string): DirectTokenReference | undefined {
    const match = /^\s*var\(\s*--([a-z][a-z0-9-]*)\s*(?:,\s*(.+))?\)\s*$/is.exec(value);
    if (!match) {
        return undefined;
    }
    const fallback = match[2]?.trim();
    return {
        variable: match[1]!.toLowerCase(),
        ...(fallback ? { fallback } : {}),
    };
}

export function directTokenReference(value: string): string | undefined {
    return parseDirectTokenReference(value)?.variable;
}
