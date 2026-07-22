import type { ControlCms } from "cms-control/ControlCms";
import type { PageCreateDto } from "cms-control/core/validation/page/parseCreateDto";

export async function createPage(cms: ControlCms, dto: PageCreateDto): Promise<void> {
    await cms.repository.insertPage(dto.path, dto.title);
}
