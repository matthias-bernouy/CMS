import type { ControlCms } from 'src/control/ControlCms';
import InvalidParam from 'src/control/errors/Http/InvalidParam';
import type { TemplateUpdateDto } from '../validation/template/parseUpdateDto';
import { assertContentRefsExist } from '../validation/contentRefs';

export async function updateTemplate(cms: ControlCms, dto: TemplateUpdateDto): Promise<void> {
    await assertContentRefsExist(cms, dto.content);

    const updated = await cms.repository.updateTemplate(dto.id, {
        name: dto.name,
        category: dto.category,
        description: dto.description,
        content: dto.content,
    });
    if (!updated) throw new InvalidParam('id', 'Unknown template id.');
}
