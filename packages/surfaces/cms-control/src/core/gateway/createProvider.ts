import type { ControlCms } from "cms-control/ControlCms";
import { isSystemSourceId, openApiSpecToSource, sourceDtoToSource, SpecParseError, SYSTEM_SOURCE_ID_PREFIX } from "@bernouy/cms-sources";
import type { SourceDto } from "../validation/gateway/parseSourceDto";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { slugify } from "cms-control/core/validation/slugify";

/**
 * Creates a gateway provider. The domain rules (urn shape, endpoint membership,
 * duplicate urns, targetUrl, header/param/status policies) are enforced by the
 * `ValidatingSourceRepository` decorator wired at the composition root. Domain
 * errors carry `.status` so HTTP surfaces do not inspect persistence failures.
 */
export async function createSource(cms: ControlCms, dto: SourceDto): Promise<void> {
    await cms.sources.createSource(sourceDtoToSource(dto));
}

export async function createSourceFromOpenApi(cms: ControlCms, body: Record<string, unknown>): Promise<void> {
    const id = sourceId(body.id);
    const spec = text(body.openapi);
    if (!spec) throw new MissingParam("openapi");
    try {
        const source = openApiSpecToSource(spec, { sourceId: id, baseUrl: text(body["openapi.baseUrl"]) });
        const name = text(body["meta.name"]);
        const description = text(body["meta.description"]);
        const icon = text(body["meta.icon"]);
        const meta = source.meta ?? { name: id };
        source.meta = {
            ...meta,
            ...(name ? { name } : {}),
            ...(description ? { description } : {}),
            ...(icon ? { icon } : {}),
        };
        await cms.sources.createSource(source);
    } catch (error) {
        if (error instanceof SpecParseError) throw new InvalidParam("openapi", error.message);
        throw error;
    }
}

function sourceId(value: unknown): string {
    if (typeof value !== "string" || !value) throw new MissingParam("id");
    const id = slugify(value);
    if (!id) throw new InvalidParam("id", "cannot derive an id");
    if (isSystemSourceId(id)) throw new InvalidParam("id", `reserved prefix "${SYSTEM_SOURCE_ID_PREFIX}"`);
    return id;
}

const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
