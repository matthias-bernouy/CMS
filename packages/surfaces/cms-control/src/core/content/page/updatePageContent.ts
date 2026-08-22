import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { invalidateUpdatedPage } from "cms-control/core/admin/server/cache/invalidation";
import type { PageContentUpdateDto } from "cms-control/core/validation/page/parseContentUpdateDto";
import { assertContentRefsExist } from "@bernouy/cms-content";

export async function updatePageContent(cms: ControlCms, dto: PageContentUpdateDto): Promise<void> {
    const existing = await cms.repository.getPageById(dto.id);
    if (!existing) {
        throw new InvalidParam("id", "Unknown page id.");
    }

    await assertContentRefsExist(cms.repository, dto.content);
    await cms.repository.updatePage({ ...existing, content: dto.content });
    invalidateUpdatedPage(cms, existing.path, existing.path);
}
