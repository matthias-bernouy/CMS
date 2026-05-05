import MissingParam from 'src/control/errors/Http/MissingParam';
import { assertValidTemplateName } from './name';
import { sanitizeTemplateCategory } from './category';

export type TemplateCreateDto = {
    name: string;
    category: string;
};

/**
 * Validates a JSON body against the template-create contract and produces a
 * fully-typed DTO. Only `name` is required — `category` is optional, and
 * `description` / `content` are filled in by the editor on first save
 * (handled by `parseUpdateDto`). Content defaults to `<p></p>` at creation.
 */
export function parseTemplateCreateDto(body: Record<string, unknown>): TemplateCreateDto {
    const { name } = body;
    if (!name) throw new MissingParam('name');

    assertValidTemplateName(name);

    return {
        name: name.trim(),
        category: sanitizeTemplateCategory(body.category),
    };
}
