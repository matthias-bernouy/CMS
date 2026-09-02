import { Buffer } from "node:buffer";
import { extname, posix } from "node:path";
import {
    decodeIntegrationPackageFile,
    type IntegrationPackageEnvelopeV1,
    type IntegrationPackageSource,
} from "@bernouy/cms-integration-packages";
import type { DeclarativeArtifactTemplate, IntegrationAsset, IntegrationDefinition } from "@bernouy/cms-integrations";

const CONTENT_TYPES: Readonly<Record<string, string>> = Object.freeze({
    ".svg": "image/svg+xml; charset=utf-8",
    ".png": "image/png",
    ".jpg": "image/jpeg",
    ".jpeg": "image/jpeg",
    ".webp": "image/webp",
});
const SVG_ICON_MAX_LENGTH = 8_000;

export async function readSnapshotIntegrationAsset(
    packages: IntegrationPackageSource,
    kind: string,
    version: string,
    path: string,
): Promise<IntegrationAsset | null> {
    if (!path.startsWith("assets/")) {
        return null;
    }
    const contentType = CONTENT_TYPES[extname(path).toLowerCase()];
    if (!contentType) {
        return null;
    }
    const resolvedPackage = await packages.getPackage(kind, version);
    const file = resolvedPackage?.envelope.files[path];
    return file ? { bytes: decodeIntegrationPackageFile(file), contentType } : null;
}

export function hydrateSnapshotDefinitionAssets(
    definition: IntegrationDefinition,
    envelope: IntegrationPackageEnvelopeV1,
): IntegrationDefinition {
    if (!definition.artifacts) {
        return definition;
    }
    return {
        ...definition,
        artifacts: definition.artifacts.map((artifact) => hydrateArtifact(artifact, envelope)),
    };
}

function hydrateArtifact(
    artifact: DeclarativeArtifactTemplate,
    envelope: IntegrationPackageEnvelopeV1,
): DeclarativeArtifactTemplate {
    if (artifact.type === "source") {
        const meta = hydrateMeta(artifact.source.meta, envelope);
        return meta === artifact.source.meta ? artifact : { ...artifact, source: { ...artifact.source, meta } };
    }
    if (artifact.type === "dashboard" && artifact.dashboard.meta) {
        const meta = hydrateMeta(artifact.dashboard.meta, envelope);
        return meta === artifact.dashboard.meta
            ? artifact
            : { ...artifact, dashboard: { ...artifact.dashboard, meta } };
    }
    if (artifact.type === "dashboard-view") {
        const meta = hydrateMeta(artifact.view.meta, envelope);
        return meta === artifact.view.meta ? artifact : { ...artifact, view: { ...artifact.view, meta } };
    }
    return hydrateBloc(artifact, envelope);
}

function hydrateMeta<T extends { icon?: string; svg?: string }>(meta: T, envelope: IntegrationPackageEnvelopeV1): T {
    if (meta.svg || !meta.icon?.startsWith("assets/")) {
        return meta;
    }
    const file = envelope.files[meta.icon];
    if (!file || !meta.icon.toLowerCase().endsWith(".svg")) {
        throw new Error(`Integration icon asset "${meta.icon}" was not found or is not an SVG`);
    }
    const svg = decodeUtf8File(file, meta.icon);
    if (
        svg.length > SVG_ICON_MAX_LENGTH ||
        !/^<svg(?:\s|>)/iu.test(svg.trimStart().replace(/^<\?xml[^>]*>\s*/iu, ""))
    ) {
        throw new Error(`Integration icon asset "${meta.icon}" must contain a bounded SVG root`);
    }
    return { ...meta, svg };
}

function hydrateBloc(
    artifact: DeclarativeArtifactTemplate,
    envelope: IntegrationPackageEnvelopeV1,
): DeclarativeArtifactTemplate {
    if (artifact.type !== "bloc" || artifact.bloc.viewJS || artifact.bloc.compositionHTML !== undefined) {
        return artifact;
    }
    if (!artifact.bloc.path) {
        throw new Error(`Bloc artifact "${artifact.bloc.tag}" requires path or viewJS`);
    }
    const root = safePackagePath("", artifact.bloc.path);
    const compositionPath = artifact.bloc.composition ? safePackagePath(root, artifact.bloc.composition) : undefined;
    const compositionHTML = compositionPath
        ? requiredUtf8File(envelope, compositionPath, "bloc composition")
        : undefined;
    const viewJS =
        compositionHTML === undefined
            ? requiredUtf8File(envelope, safePackagePath(root, artifact.bloc.view ?? "Bloc.ts"), "bloc view")
            : undefined;
    const editorJS = optionalEditor(envelope, root, artifact.bloc.editor);
    const source: Record<string, string> = {};
    const prefix = root ? `${root}/` : "";
    for (const path of Object.keys(envelope.files).sort()) {
        if (path.startsWith(prefix)) {
            source[path.slice(prefix.length)] = Buffer.from(
                decodeIntegrationPackageFile(envelope.files[path]!),
            ).toString("base64");
        }
    }
    return {
        ...artifact,
        bloc: {
            ...artifact.bloc,
            ...(viewJS !== undefined ? { viewJS } : {}),
            ...(compositionHTML !== undefined ? { compositionHTML } : {}),
            ...(editorJS !== undefined ? { editorJS } : {}),
            source,
        },
    };
}

function optionalEditor(
    envelope: IntegrationPackageEnvelopeV1,
    root: string,
    editor: string | null | undefined,
): string | null | undefined {
    if (editor === null) {
        return null;
    }
    const path = safePackagePath(root, editor ?? "BlocEditor.ts");
    const file = envelope.files[path];
    if (!file && editor === undefined) {
        return undefined;
    }
    return file ? decodeUtf8File(file, path) : requiredUtf8File(envelope, path, "bloc editor");
}

function requiredUtf8File(envelope: IntegrationPackageEnvelopeV1, path: string, source: string): string {
    const file = envelope.files[path];
    if (!file) {
        throw new Error(`Integration ${source} was not found: ${path}`);
    }
    return decodeUtf8File(file, path);
}

function decodeUtf8File(file: IntegrationPackageEnvelopeV1["files"][string], path: string): string {
    try {
        return new TextDecoder("utf-8", { fatal: true }).decode(decodeIntegrationPackageFile(file));
    } catch {
        throw new Error(`Integration package file must contain valid UTF-8: ${path}`);
    }
}

function safePackagePath(root: string, reference: string): string {
    if (!reference.trim() || reference.includes("\\") || reference.startsWith("/")) {
        throw new Error(`Integration package reference must be a safe relative path: ${reference}`);
    }
    const path = posix.normalize(posix.join(root, reference));
    if (path === ".." || path.startsWith("../")) {
        throw new Error(`Integration package reference escapes its version root: ${reference}`);
    }
    return path === "." ? "" : path;
}
