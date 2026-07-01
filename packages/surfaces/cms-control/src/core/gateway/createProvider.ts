import type { ControlCms } from "cms-control/ControlCms";
import { sourceDtoToSource } from "@bernouy/cms-sources";
import type { SourceDto } from "../validation/gateway/parseSourceDto";

/**
 * Creates a gateway provider. The domain rules (urn shape, endpoint membership,
 * duplicate urns, targetUrl, header/param/status policies) are enforced by the
 * `ValidatingSourceRepository` decorator wired at the composition root. Domain
 * errors carry `.status` so HTTP surfaces do not inspect persistence failures.
 */
export async function createSource(cms: ControlCms, dto: SourceDto): Promise<void> {
    await cms.sources.createSource(sourceDtoToSource(dto));
}
