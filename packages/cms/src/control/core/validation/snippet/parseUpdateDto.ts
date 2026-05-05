import MissingParam from 'src/control/errors/Http/MissingParam';
import { assertValidSnippetId } from './id';
import { assertValidSnippetName } from './name';
import { sanitizeSnippetCategory } from './category';
import { sanitizeSnippetDescription } from './description';
import { sanitizeSnippetContent } from './content';

export type SnippetUpdateDto = {
    id: string;
    name: string;
    category: string;
    description: string;
    content: string;
};

/**
 * Validates a JSON body against the snippet-update contract and produces a
 * fully-typed DTO. The `identifier` is intentionally absent — it is
 * immutable post-creation. Throws `MissingParam` for absent required fields
 * and `InvalidParam` for malformed values.
 */
export function parseSnippetUpdateDto(body: Record<string, unknown>): SnippetUpdateDto {
    const { id, name } = body;
    if (!id)   throw new MissingParam('id');
    if (!name) throw new MissingParam('name');

    assertValidSnippetId(id);
    assertValidSnippetName(name);

    return {
        id,
        name: name.trim(),
        category:    sanitizeSnippetCategory(body.category),
        description: sanitizeSnippetDescription(body.description),
        content:     sanitizeSnippetContent(body.content),
    };
}
