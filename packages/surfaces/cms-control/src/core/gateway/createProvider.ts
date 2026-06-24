import type { ControlCms } from "cms-control/ControlCms";
import { isSystemProviderId, openApiSpecToProvider, providerDtoToProvider, SpecParseError, SYSTEM_PROVIDER_ID_PREFIX } from "@bernouy/cms-gateway";
import type { ProviderDto } from "../validation/gateway/parseProviderDto";
import MissingParam from "cms-control/errors/Http/MissingParam";
import InvalidParam from "cms-control/errors/Http/InvalidParam";
import { slugify } from "cms-control/core/validation/slugify";

/**
 * Creates a gateway provider. The domain rules (urn shape, endpoint membership,
 * duplicate urns, targetUrl, header/param/status policies) are enforced by the
 * `ValidatingGatewayRepository` decorator wired at the composition root. Domain
 * errors carry `.status` so HTTP surfaces do not inspect persistence failures.
 */
export async function createProvider(cms: ControlCms, dto: ProviderDto): Promise<void> {
    await cms.gateway.createProvider(providerDtoToProvider(dto));
}

export async function createProviderFromOpenApi(cms: ControlCms, body: Record<string, unknown>): Promise<void> {
    const id = providerId(body.id);
    const spec = text(body.openapi);
    if (!spec) throw new MissingParam("openapi");
    try {
        const provider = openApiSpecToProvider(spec, { providerId: id, baseUrl: text(body["openapi.baseUrl"]) });
        const name = text(body["meta.name"]);
        const description = text(body["meta.description"]);
        const icon = text(body["meta.icon"]);
        const meta = provider.meta ?? { name: id };
        provider.meta = {
            ...meta,
            ...(name ? { name } : {}),
            ...(description ? { description } : {}),
            ...(icon ? { icon } : {}),
        };
        await cms.gateway.createProvider(provider);
    } catch (error) {
        if (error instanceof SpecParseError) throw new InvalidParam("openapi", error.message);
        throw error;
    }
}

function providerId(value: unknown): string {
    if (typeof value !== "string" || !value) throw new MissingParam("id");
    const id = slugify(value);
    if (!id) throw new InvalidParam("id", "cannot derive an id");
    if (isSystemProviderId(id)) throw new InvalidParam("id", `reserved prefix "${SYSTEM_PROVIDER_ID_PREFIX}"`);
    return id;
}

const text = (value: unknown): string | undefined =>
    typeof value === "string" && value.trim() ? value.trim() : undefined;
