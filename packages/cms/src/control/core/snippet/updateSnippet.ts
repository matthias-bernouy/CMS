import type { ControlCms } from 'src/control/ControlCms';
import InvalidParam from 'src/control/errors/Http/InvalidParam';
import { P9R_CACHE } from 'src/socle/constants/p9r-constants';
import type { SnippetUpdateDto } from '../validation/snippet/parseUpdateDto';

export async function updateSnippet(cms: ControlCms, dto: SnippetUpdateDto): Promise<void> {
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
