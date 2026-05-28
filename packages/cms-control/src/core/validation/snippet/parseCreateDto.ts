import MissingParam from 'src/control/errors/Http/MissingParam';
import { assertValidSnippetIdentifier } from './identifier';
import { assertValidSnippetName } from './name';
import { sanitizeSnippetCategory } from './category';

export type SnippetCreateDto = {
    identifier: string;
    name: string;
    category: string;
};

/**
 * Validates a JSON body against the snippet-create contract and produces a
 * fully-typed DTO. `identifier` and `name` are required — `category` is
 * optional, and `description` / `content` are filled in by the editor on
 * first save (handled by `parseUpdateDto`). Content defaults to `<p></p>`
 * at creation. The identifier is immutable after creation.
 */
export function parseSnippetCreateDto(body: Record<string, unknown>): SnippetCreateDto {
    const { identifier, name } = body;
    if (!identifier) throw new MissingParam('identifier');
    if (!name)       throw new MissingParam('name');

    assertValidSnippetIdentifier(identifier);
    assertValidSnippetName(name);

    return {
        identifier,
        name: name.trim(),
        category: sanitizeSnippetCategory(body.category),
    };
}
