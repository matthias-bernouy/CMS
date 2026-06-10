import MissingParam from 'cms-control/errors/Http/MissingParam';
import { DEFAULT_SNIPPET_CONTENT } from '../contentDefaults';

export type SnippetUpdateDto = {
    id: string;
    name: string;
    category: string;
    description: string;
    content: string;
};

/**
 * Extract the snippet-update body: presence + shape coercion. `identifier`
 * is intentionally absent (immutable). Domain rules run at write time.
 */
export function parseSnippetUpdateDto(body: Record<string, unknown>): SnippetUpdateDto {
    const { id, name } = body;
    if (!id)   throw new MissingParam('id');
    if (!name) throw new MissingParam('name');
    const content = body.content == null || String(body.content).trim() === '' ? DEFAULT_SNIPPET_CONTENT : String(body.content);
    return {
        id:          String(id),
        name:        String(name),
        category:    body.category    == null ? '' : String(body.category),
        description: body.description == null ? '' : String(body.description),
        content,
    };
}
