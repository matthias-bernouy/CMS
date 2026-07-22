import type { ControlCms } from "cms-control/ControlCms";
import { DEFAULT_TEMPLATE_CONTENT } from "cms-control/core/validation/template/defaults";
import type { TemplateCreateDto } from "cms-control/core/validation/template/parseCreateDto";

export async function createTemplate(cms: ControlCms, dto: TemplateCreateDto): Promise<void> {
    await cms.repository.createTemplate({
        identifier: dto.identifier,
        name: dto.name,
        category: dto.category,
        description: "",
        content: DEFAULT_TEMPLATE_CONTENT,
        createdAt: new Date(),
    });
}
