import { blocThumbnailFromSource } from "@bernouy/cms-content";
import { Buffer } from "node:buffer";
import { readdir, readFile } from "node:fs/promises";
import { relative, sep } from "node:path";
import type { DeclarativeArtifactTemplate, IntegrationDefinition } from "../../interfaces/Integration";
import { hydrateDefinitionIconAssets, SVG_ICON_MAX_BYTES } from "../definition-assets/icons";
import { readIntegrationAsset } from "./assets";
import { isNodeError, resolveExistingPathWithin } from "./repositorySupport";

export async function hydrateVersionAssets(
    definition: IntegrationDefinition,
    versionRoot: string,
): Promise<IntegrationDefinition> {
    const withIcons = await hydrateDefinitionIconAssets(definition, (path) =>
        readIntegrationAsset(versionRoot, path, SVG_ICON_MAX_BYTES),
    );
    if (!withIcons.artifacts?.some((artifact) => artifact.type === "bloc")) {
        return withIcons;
    }
    const artifacts = await Promise.all(
        withIcons.artifacts.map(async (artifact) =>
            hydrateThumbnail(await hydrateBloc(artifact, versionRoot), versionRoot),
        ),
    );
    return { ...withIcons, artifacts } as IntegrationDefinition;
}

async function hydrateBloc(
    artifact: DeclarativeArtifactTemplate,
    versionRoot: string,
): Promise<DeclarativeArtifactTemplate> {
    if (artifact.type !== "bloc" || artifact.bloc.viewJS || artifact.bloc.compositionHTML !== undefined) {
        return artifact;
    }
    if (!artifact.bloc.path) {
        throw new Error(`Bloc artifact "${artifact.bloc.tag}" requires path or viewJS`);
    }
    const blocRoot = await resolveExistingPathWithin(versionRoot, "bloc", artifact.bloc.path);
    const compositionHTML = artifact.bloc.composition
        ? await readFile(await resolveExistingPathWithin(blocRoot, "bloc", artifact.bloc.composition), "utf-8")
        : undefined;
    const viewJS =
        compositionHTML === undefined
            ? await readFile(
                  await resolveExistingPathWithin(blocRoot, "bloc", artifact.bloc.view ?? "Bloc.ts"),
                  "utf-8",
              )
            : undefined;
    const editorJS = await readOptionalEditor(blocRoot, artifact.bloc.editor);
    const source = await readSourceBundle(blocRoot);
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

async function hydrateThumbnail(
    artifact: DeclarativeArtifactTemplate,
    root: string,
): Promise<DeclarativeArtifactTemplate> {
    if (artifact.type !== "bloc") {
        return artifact;
    }
    const thumbnail = artifact.bloc.thumbnail ?? blocThumbnailFromSource(artifact.bloc.source);
    if (!thumbnail) {
        return artifact;
    }
    const image = await readIntegrationAsset(root, thumbnail.path);
    return {
        ...artifact,
        bloc: {
            ...artifact.bloc,
            thumbnail,
            ...(image
                ? { source: { ...artifact.bloc.source, [thumbnail.path]: Buffer.from(image.bytes).toString("base64") } }
                : {}),
        },
    };
}

async function readOptionalEditor(root: string, editor: string | null | undefined): Promise<string | null | undefined> {
    if (editor === null) {
        return null;
    }
    try {
        return await readFile(await resolveExistingPathWithin(root, "bloc", editor ?? "BlocEditor.ts"), "utf-8");
    } catch (error) {
        if (editor === undefined && isNodeError(error) && error.code === "ENOENT") {
            return undefined;
        }
        throw error;
    }
}

async function readSourceBundle(root: string): Promise<Record<string, string>> {
    const out: Record<string, string> = {};
    await readSourceDirectory(root, root, out);
    return out;
}

async function readSourceDirectory(root: string, dir: string, out: Record<string, string>): Promise<void> {
    const entries = await readdir(dir, { withFileTypes: true });
    for (const entry of entries) {
        if (!entry.isDirectory() && !entry.isFile()) {
            continue;
        }
        const absolutePath = await resolveExistingPathWithin(dir, "bloc", entry.name);
        if (entry.isDirectory()) {
            await readSourceDirectory(root, absolutePath, out);
        } else {
            const key = relative(root, absolutePath).split(sep).join("/");
            out[key] = Buffer.from(await readFile(absolutePath)).toString("base64");
        }
    }
}
