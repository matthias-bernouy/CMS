import type { ControlCms } from "cms-control/ControlCms";
import InvalidParam from "cms-control/core/admin/http/errors/InvalidParam";
import { sourceDtoToSource } from "@bernouy/cms-sources";
import type { SourceDto } from "../validation/gateway/parseSourceDto";

/**
 * Updates a gateway provider. The urn (derived from `dto.id`) is the immutable key,
 * so this is a no-rename, full-aggregate replace: the submitted endpoint set wholly
 * replaces the stored one. Domain rules are enforced by the `ValidatingSourceRepository`
 * decorator wired at the composition root; an unknown urn (repo returned `null`) is a 400.
 */
export async function updateSource(cms: ControlCms, dto: SourceDto): Promise<void> {
    const updated = await cms.sources.updateSource(sourceDtoToSource(dto));
    if (!updated) {
        throw new InvalidParam("urn", "unknown provider");
    }
}
