import { validatePageIndexingConfiguration } from "@bernouy/cms-content";
import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { invalidateUpdatedPage } from "cms-control/core/admin/server/cache/invalidation";
import type { PageConfigUpdateDto } from "cms-control/core/validation/page/parseConfigUpdateDto";
import { resolvePageIndexingSelection } from "cms-control/core/content/page/indexing/pageIndexingSelection";
import { validateIndexingProjection } from "cms-control/core/content/page/indexing/pageIndexingProjectionValidation";

export async function updatePageConfig(cms: ControlCms, dto: PageConfigUpdateDto): Promise<string> {
    const existing = await cms.repository.getPageById(dto.id);
    if (!existing) {
        throw new InvalidParam("id", "Unknown page id.");
    }
    if (dto.path !== existing.path) {
        throw new InvalidParam("path", "Manage page languages to change a path.");
    }
    const configured = cms.config.capabilityGateway;
    const capabilities =
        (dto.indexingSelection?.candidate || dto.indexing?.entity) && configured?.catalogue
            ? await configured.catalogue.list(configured.siteId)
            : [];
    const indexing = dto.indexingSelection
        ? await resolvePageIndexingSelection(existing, capabilities, dto.indexingSelection)
        : dto.indexing === undefined
          ? undefined
          : validatePageIndexingConfiguration(dto.indexing);
    if (!dto.indexingSelection && indexing?.entity) {
        const capability = capabilities.find(
            (item) =>
                item.contractId === indexing.entity?.contractId &&
                item.capabilityId === indexing.entity.resolve.capabilityId,
        );
        if (!capability) {
            throw new InvalidParam("indexing", "The selected gateway capability is unavailable.");
        }
        validateIndexingProjection(indexing.entity, capability, capabilities);
    }

    await cms.repository.updatePage({
        id: existing.id,
        title: dto.title,
        path: dto.path,
        description: dto.description,
        visible: dto.visible,
        tags: dto.tags,
        ...(indexing !== undefined ? { indexing } : {}),
    });

    await invalidateUpdatedPage(cms, existing);
    return (await cms.repository.getPage(dto.path))?.id ?? dto.id;
}
