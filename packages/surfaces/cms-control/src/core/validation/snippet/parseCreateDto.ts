import MissingParam from 'cms-control/errors/Http/MissingParam';

export type SnippetCreateDto = {
    identifier: string;
    name: string;
    category: string;
};

/**
 * Extract the snippet-create body: presence + shape coercion. The identifier
 * is immutable post-creation. Domain rules run in `ValidatingCmsRepository`.
 */
export function parseSnippetCreateDto(body: Record<string, unknown>): SnippetCreateDto {
    const { identifier, name } = body;
    if (!identifier) throw new MissingParam('identifier');
    if (!name)       throw new MissingParam('name');
    return {
        identifier: String(identifier),
        name:       String(name),
        category:   body.category == null ? '' : String(body.category),
    };
}
