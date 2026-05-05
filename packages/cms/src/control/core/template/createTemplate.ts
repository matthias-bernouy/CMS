import type { ControlCms } from 'src/control/ControlCms';
import { DEFAULT_TEMPLATE_CONTENT } from '../validation/template/content';
import type { TemplateCreateDto } from '../validation/template/parseCreateDto';

export async function createTemplate(cms: ControlCms, dto: TemplateCreateDto): Promise<void> {
    await cms.repository.createTemplate({
        name: dto.name,
        category: dto.category,
        description: '',
        content: DEFAULT_TEMPLATE_CONTENT,
        createdAt: new Date(),
    });
}
