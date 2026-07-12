import type { Source, SourceEndpoint } from "../interfaces/Source";
import type { SourceRepository } from "../interfaces/SourceRepository";
import type { SourceOverlay, SourceOverlayRepository } from "../interfaces/SourceOverlay";
import type { ExecutorDeps } from "./executeEndpoint";
import { materializeSourceOverlays } from "./sourceOverlayDynamicFields";
import { applySourceOverlays, overlaysFor, sourceOverlayFieldPath } from "./sourceOverlayProjection";
import { parseUrn, sourceUrnOf } from "./urn";

export type SourceOverlaySourceRepositoryOptions = {
    deps?: ExecutorDeps;
};

export class SourceOverlaySourceRepository implements SourceRepository {
    constructor(
        private readonly inner: SourceRepository,
        private readonly overlays: SourceOverlayRepository,
        private readonly options: SourceOverlaySourceRepositoryOptions = {},
    ) {}

    createSource(source: Source): Promise<Source> {
        return this.inner.createSource(source);
    }

    updateSource(source: Source): Promise<Source | null> {
        return this.inner.updateSource(source);
    }

    deleteSource(urn: string): Promise<boolean> {
        return this.inner.deleteSource(urn);
    }

    async getSource(urn: string): Promise<Source | null> {
        const source = await this.inner.getSource(urn);
        if (!source) return null;
        const overlays = await this.overlays.getOverlaysForSource(sourceId(source));
        return applySourceOverlays(source, await materializeSourceOverlays(source, overlays, this.options.deps));
    }

    async getAllSources(): Promise<Source[]> {
        const sources = await this.inner.getAllSources();
        const overlays = await this.overlays.getAllOverlays();
        return Promise.all(sources.map(async source =>
            applySourceOverlays(
                source,
                await materializeSourceOverlays(source, overlaysFor(source, overlays), this.options.deps),
            )));
    }

    async getEndpoint(urn: string): Promise<SourceEndpoint | null> {
        const sourceUrn = sourceUrnOf(urn);
        if (!sourceUrn) return this.inner.getEndpoint(urn);
        const source = await this.inner.getSource(sourceUrn);
        if (!source) return null;

        const endpoint = source.endpoints.find(candidate => candidate.urn === urn);
        if (!endpoint) return null;

        const endpointId = parseUrn(urn)?.endpoint ?? "";
        const overlays = (await this.overlays.getOverlaysForSource(sourceId(source)))
            .filter(overlay => overlayTargetsEndpoint(overlay, endpointId));
        if (!overlays.length) return structuredClone(endpoint);

        const enriched = applySourceOverlays(
            source,
            await materializeSourceOverlays(source, overlays, this.options.deps),
        );
        return enriched.endpoints.find(candidate => candidate.urn === urn) ?? null;
    }

    async getEndpointForAuthorization(urn: string): Promise<SourceEndpoint | null> {
        if (this.inner.getEndpointForAuthorization) {
            return this.inner.getEndpointForAuthorization(urn);
        }
        return this.inner.getEndpoint(urn);
    }
}

function sourceId(source: Source): string {
    return parseUrn(source.urn)?.source ?? "";
}

function overlayTargetsEndpoint(
    overlay: SourceOverlay,
    endpointId: string,
): boolean {
    return [...(overlay.input ?? []), ...(overlay.output ?? [])]
        .some(target => target.endpointId === endpointId);
}

export {
    applySourceOverlays,
    materializeSourceOverlays,
    sourceOverlayFieldPath,
};
