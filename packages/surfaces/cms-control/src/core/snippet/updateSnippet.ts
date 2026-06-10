import type { ControlCms } from 'cms-control/ControlCms';
import InvalidParam from 'cms-control/errors/Http/InvalidParam';
import { P9R_CACHE } from '@bernouy/cms-content';
import type { SnippetUpdateDto } from '../validation/snippet/parseUpdateDto';
import { assertContentRefsExist } from "@bernouy/cms-content";

export async function updateSnippet(cms: ControlCms, dto: SnippetUpdateDto): Promise<void> {
    await assertContentRefsExist(cms.repository, dto.content);

    const updated = await cms.repository.updateSnippet(dto.id, {
        name: dto.name,
        category: dto.category,
        description: dto.description,
        content: dto.content,
    });
    if (!updated) throw new InvalidParam('id', 'Unknown snippet id.');

    const usages = await cms.repository.findPagesUsingSnippet(updated.identifier);
    for (const page of usages) {
        cms.cache.delete(P9R_CACHE.page(page.path));
    }
}
