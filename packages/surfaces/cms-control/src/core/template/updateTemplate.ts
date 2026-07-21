import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import type { TemplateUpdateDto } from "../validation/template/parseUpdateDto";
import { assertContentRefsExist } from "@bernouy/cms-content";

export async function updateTemplate(cms: ControlCms, dto: TemplateUpdateDto): Promise<void> {
    await assertContentRefsExist(cms.repository, dto.content);

    const updated = await cms.repository.updateTemplate(dto.id, {
        name: dto.name,
        category: dto.category,
        description: dto.description,
        content: dto.content,
    });
    if (!updated) {
        throw new InvalidParam("id", "Unknown template id.");
    }
}
