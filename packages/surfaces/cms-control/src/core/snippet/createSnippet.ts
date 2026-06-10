import type { ControlCms } from 'cms-control/ControlCms';
import InvalidParam from 'cms-control/errors/Http/InvalidParam';
import { DEFAULT_SNIPPET_CONTENT } from '../validation/contentDefaults';
import type { SnippetCreateDto } from '../validation/snippet/parseCreateDto';

export async function createSnippet(cms: ControlCms, dto: SnippetCreateDto): Promise<void> {
    const existing = await cms.repository.getSnippetByIdentifier(dto.identifier);
    if (existing) {
        throw new InvalidParam('identifier', `"${dto.identifier}" is already used by another snippet.`);
    }

    const now = new Date();
    await cms.repository.createSnippet({
        identifier: dto.identifier,
        name: dto.name,
        category: dto.category,
        description: '',
        content: DEFAULT_SNIPPET_CONTENT,
        createdAt: now,
        updatedAt: now,
    });
}
