import MissingParam from 'src/control/errors/Http/MissingParam';
import { assertValidTemplateId } from './id';
import { assertValidTemplateName } from './name';
import { sanitizeTemplateCategory } from './category';
import { sanitizeTemplateDescription } from './description';
import { sanitizeTemplateContent } from './content';

export type TemplateUpdateDto = {
    id: string;
    name: string;
    category: string;
    description: string;
    content: string;
};

/**
 * Validates a JSON body against the template-update contract and produces a
 * fully-typed DTO. Throws `MissingParam` for absent required fields and
 * `InvalidParam` for malformed values — caller doesn't need to redo any
 * runtime checks on the returned object.
 */
export function parseTemplateUpdateDto(body: Record<string, unknown>): TemplateUpdateDto {
    const { id, name } = body;
    if (!id)   throw new MissingParam('id');
    if (!name) throw new MissingParam('name');

    assertValidTemplateId(id);
    assertValidTemplateName(name);

    return {
        id,
        name: name.trim(),
        category:    sanitizeTemplateCategory(body.category),
        description: sanitizeTemplateDescription(body.description),
        content:     sanitizeTemplateContent(body.content),
    };
}
