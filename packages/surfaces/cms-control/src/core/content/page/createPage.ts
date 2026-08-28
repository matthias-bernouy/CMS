import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import type { PageCreateDto } from "cms-control/core/validation/page/parseCreateDto";

export async function createPage(cms: ControlCms, dto: PageCreateDto): Promise<void> {
    if (!dto.sourcePath) {
        await cms.repository.insertPage(dto.path, dto.title);
        return;
    }
    const source = await cms.repository.getPage(dto.sourcePath);
    if (!source) {
        throw new InvalidParam("sourcePath", "must reference an existing page.");
    }
    await cms.repository.insertPage(dto.path, dto.title, source.content);
}
