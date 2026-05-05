import type { DeliveryRepository } from "src/delivery/interfaces/DeliveryRepository";

/**
 * Replace `<w13c-snippet identifier="...">...</w13c-snippet>` wrappers with
 * the current snippet content fetched from the repository. The wrapper itself
 * is preserved to keep usage traceable in the rendered HTML.
 *
 * v1 note: nested snippets are not supported. Single pass, no recursion.
 */
export async function expandSnippets(content: string, repository: DeliveryRepository): Promise<string> {
    const regex = /<w13c-snippet\b([^>]*)>([\s\S]*?)<\/w13c-snippet>/gi;
    const matches = [...content.matchAll(regex)];
    if (matches.length === 0) return content;

    const identifiers = new Set<string>();
    for (const match of matches) {
        const attrs = match[1] || "";
        const idMatch = attrs.match(/\bidentifier\s*=\s*["']([^"']+)["']/i);
        if (idMatch) identifiers.add(idMatch[1]!);
    }

    const entries = await Promise.all(
        [...identifiers].map(async id => {
            const snippet = await repository.getSnippetByIdentifier(id);
            return [id, snippet?.content ?? ""] as const;
        })
    );
    const map = new Map(entries);

    return content.replace(regex, (_full, attrs: string) => {
        const idMatch = attrs.match(/\bidentifier\s*=\s*["']([^"']+)["']/i);
        if (!idMatch) return `<w13c-snippet${attrs}></w13c-snippet>`;
        const id = idMatch[1]!;
        const expanded = map.get(id) ?? "";
        return `<w13c-snippet${attrs}>${expanded}</w13c-snippet>`;
    });
}
