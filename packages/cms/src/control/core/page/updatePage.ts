import type { ControlCms } from 'src/control/ControlCms';
import InvalidParam from 'src/control/errors/Http/InvalidParam';
import type { PageUpdateDto } from '../validation/page/parseUpdateDto';

export async function updatePage(cms: ControlCms, dto: PageUpdateDto): Promise<void> {
    const existing = await cms.repository.getPageById(dto.id);
    if (!existing) throw new InvalidParam('id', 'Unknown page id.');

    await cms.repository.updatePage({
        ...existing,
        title: dto.title,
        path: dto.path,
        content: dto.content,
        description: dto.description,
        visible: dto.visible,
        tags: dto.tags,
    });
}
