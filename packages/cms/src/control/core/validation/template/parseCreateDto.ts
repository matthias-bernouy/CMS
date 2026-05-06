import MissingParam from 'src/control/errors/Http/MissingParam';
import { assertValidTemplateIdentifier } from './identifier';
import { assertValidTemplateName } from './name';
import { sanitizeTemplateCategory } from './category';

export type TemplateCreateDto = {
    identifier: string;
    name: string;
    category: string;
};

/**
 * Validates a JSON body against the template-create contract and produces a
 * fully-typed DTO. `identifier` and `name` are required — `category` is
 * optional, and `description` / `content` are filled in by the editor on
 * first save (handled by `parseUpdateDto`). Content defaults to `<p></p>`
 * at creation. The identifier is immutable after creation.
 */
export function parseTemplateCreateDto(body: Record<string, unknown>): TemplateCreateDto {
    const { identifier, name } = body;
    if (!identifier) throw new MissingParam('identifier');
    if (!name)       throw new MissingParam('name');

    assertValidTemplateIdentifier(identifier);
    assertValidTemplateName(name);

    return {
        identifier,
        name: name.trim(),
        category: sanitizeTemplateCategory(body.category),
    };
}
