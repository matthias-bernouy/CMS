const SOURCE_ALIAS_PATTERN = /^\s*([\s\S]+?)\s+as\s+([A-Za-z_$][\w$]*)\s*$/;

export type SourceSpec = {
    url: string;
    alias?: string;
};

export function sourceUrl(value: string): string {
    return parseSourceSpec(value).url;
}

export function parseSourceSpec(value: string): SourceSpec {
    const match = SOURCE_ALIAS_PATTERN.exec(value);
    if (!match) return { url: value.trim() };

    return {
        url:   match[1]!.trim(),
        alias: match[2]!,
    };
}
