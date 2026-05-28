import MissingParam from 'src/control/errors/Http/MissingParam';
import { assertValidPageTitle } from './title';
import { assertValidPagePath } from './path';

export type PageCreateDto = {
    title: string;
    path: string;
};

/**
 * Validates a JSON body against the page-create contract and produces a
 * fully-typed DTO. Only `title` and `path` are required — everything else
 * is filled in by the editor on first save (handled by `parseUpdateDto`).
 */
export function parsePageCreateDto(body: Record<string, unknown>): PageCreateDto {
    const { title, path } = body;
    if (!title) throw new MissingParam('title');
    if (!path)  throw new MissingParam('path');

    assertValidPageTitle(title);
    assertValidPagePath(path);

    return { title: title.trim(), path };
}
