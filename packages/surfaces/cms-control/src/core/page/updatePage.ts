import type { ControlCms } from 'cms-control/ControlCms';
import InvalidParam from 'cms-control/errors/Http/InvalidParam';
import type { PageUpdateDto } from '../validation/page/parseUpdateDto';
import { assertContentRefsExist } from "@bernouy/cms-content";

export async function updatePage(cms: ControlCms, dto: PageUpdateDto): Promise<void> {
    const existing = await cms.repository.getPageById(dto.id);
    if (!existing) throw new InvalidParam('id', 'Unknown page id.');

    await assertContentRefsExist(cms.repository, dto.content);

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
