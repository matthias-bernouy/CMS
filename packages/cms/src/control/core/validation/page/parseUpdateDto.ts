import MissingParam from 'src/control/errors/Http/MissingParam';
import { assertValidPageId } from './id';
import { assertValidPageTitle } from './title';
import { assertValidPagePath } from './path';
import { sanitizePageContent } from './content';
import { sanitizePageDescription } from './description';
import { coerceVisible } from './visible';
import { parsePageTags } from './tags';

export type PageUpdateDto = {
    id: string;
    title: string;
    path: string;
    content: string;
    description: string;
    visible: boolean;
    tags: string[];
};

/**
 * Validates a JSON body against the page-update contract and produces a
 * fully-typed DTO. Throws `MissingParam` for absent required fields and
 * `InvalidParam` for malformed values — caller doesn't need to redo any
 * runtime checks on the returned object.
 */
export function parsePageUpdateDto(body: Record<string, unknown>): PageUpdateDto {
    const { id, title, path } = body;
    if (!id)    throw new MissingParam('id');
    if (!title) throw new MissingParam('title');
    if (!path)  throw new MissingParam('path');

    assertValidPageId(id);
    assertValidPageTitle(title);
    assertValidPagePath(path);

    return {
        id,
        title: title.trim(),
        path,
        content:     sanitizePageContent(body.content),
        description: sanitizePageDescription(body.description),
        visible:     coerceVisible(body.visible),
        tags:        parsePageTags(body.tags),
    };
}
