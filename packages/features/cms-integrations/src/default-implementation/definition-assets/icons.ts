import type { DeclarativeArtifactTemplate, IntegrationDefinition } from "../../interfaces/Integration";
import type { IntegrationAsset } from "../../interfaces/IntegrationDefinitionRepository";

export const SVG_ICON_MAX_LENGTH = 8_000;
export const SVG_ICON_MAX_BYTES = SVG_ICON_MAX_LENGTH * 4;

export type IntegrationAssetLoader = (path: string) => Promise<IntegrationAsset | null>;

export async function hydrateDefinitionIconAssets(
    definition: IntegrationDefinition,
    loadAsset: IntegrationAssetLoader,
): Promise<IntegrationDefinition> {
    if (!definition.artifacts?.some(hasUnhydratedIconAsset)) return definition;
    const resolveSvg = cachedSvgResolver(loadAsset);
    const artifacts: DeclarativeArtifactTemplate[] = [];
    for (const artifact of definition.artifacts) {
        artifacts.push(await hydrateArtifactIcon(artifact, resolveSvg));
    }
    return { ...definition, artifacts };
}

function hasUnhydratedIconAsset(artifact: DeclarativeArtifactTemplate): boolean {
    if (artifact.type === "source") return isAssetIcon(artifact.source.meta.icon) && !artifact.source.meta.svg;
    if (artifact.type === "dashboard") return isAssetIcon(artifact.dashboard.meta?.icon) && !artifact.dashboard.meta?.svg;
    return false;
}

async function hydrateArtifactIcon(
    artifact: DeclarativeArtifactTemplate,
    resolveSvg: (path: string) => Promise<string>,
): Promise<DeclarativeArtifactTemplate> {
    if (artifact.type === "source") {
        const meta = await hydrateMeta(artifact.source.meta, resolveSvg);
        return meta === artifact.source.meta ? artifact : { ...artifact, source: { ...artifact.source, meta } };
    }
    if (artifact.type === "dashboard" && artifact.dashboard.meta) {
        const meta = await hydrateMeta(artifact.dashboard.meta, resolveSvg);
        return meta === artifact.dashboard.meta ? artifact : { ...artifact, dashboard: { ...artifact.dashboard, meta } };
    }
    return artifact;
}

async function hydrateMeta<T extends { icon?: string; svg?: string }>(
    meta: T,
    resolveSvg: (path: string) => Promise<string>,
): Promise<T> {
    if (meta.svg || !isAssetIcon(meta.icon)) return meta;
    return { ...meta, svg: await resolveSvg(meta.icon) };
}

function cachedSvgResolver(loadAsset: IntegrationAssetLoader): (path: string) => Promise<string> {
    const cache = new Map<string, Promise<string>>();
    return path => {
        const cached = cache.get(path);
        if (cached) return cached;
        const pending = loadSvg(path, loadAsset);
        cache.set(path, pending);
        return pending;
    };
}

async function loadSvg(path: string, loadAsset: IntegrationAssetLoader): Promise<string> {
    if (!path.toLowerCase().endsWith(".svg")) {
        throw new Error(`Integration icon asset "${path}" must be an SVG`);
    }
    const asset = await loadAsset(path);
    if (!asset) throw new Error(`Integration icon asset "${path}" was not found`);
    if (!/^image\/svg\+xml(?:\s*;|$)/i.test(asset.contentType)) {
        throw new Error(`Integration icon asset "${path}" must have an SVG content type`);
    }
    let svg: string;
    try {
        svg = new TextDecoder("utf-8", { fatal: true }).decode(asset.bytes);
    } catch {
        throw new Error(`Integration icon asset "${path}" must contain valid UTF-8`);
    }
    if (svg.length > SVG_ICON_MAX_LENGTH) {
        throw new Error(`Integration icon asset "${path}" exceeds ${SVG_ICON_MAX_LENGTH} characters`);
    }
    const root = svg.trimStart().replace(/^<\?xml[^>]*>\s*/i, "");
    if (!/^<svg(?:\s|>)/i.test(root)) {
        throw new Error(`Integration icon asset "${path}" must contain an SVG root`);
    }
    return svg;
}

function isAssetIcon(value: string | undefined): value is string {
    return Boolean(value?.startsWith("assets/"));
}
