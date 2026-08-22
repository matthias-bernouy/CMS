import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { invalidateUpdatedPage } from "cms-control/core/admin/server/cache/invalidation";
import type { PageConfigUpdateDto } from "cms-control/core/validation/page/parseConfigUpdateDto";

export async function updatePageConfig(cms: ControlCms, dto: PageConfigUpdateDto): Promise<string> {
    const existing = await cms.repository.getPageById(dto.id);
    if (!existing) {
        throw new InvalidParam("id", "Unknown page id.");
    }

    await cms.repository.updatePage({
        ...existing,
        title: dto.title,
        path: dto.path,
        description: dto.description,
        visible: dto.visible,
        tags: dto.tags,
    });

    invalidateUpdatedPage(cms, existing.path, dto.path);
    return (await cms.repository.getPage(dto.path))?.id ?? dto.id;
}
