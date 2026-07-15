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
    const withIcons = await hydrateDefinitionIconAssets(
        definition,
        path => readIntegrationAsset(versionRoot, path, SVG_ICON_MAX_BYTES),
    );
    if (!withIcons.artifacts?.some(artifact => artifact.type === "bloc")) return withIcons;
    const artifacts = await Promise.all(withIcons.artifacts.map(artifact => hydrateBloc(artifact, versionRoot)));
    return { ...withIcons, artifacts };
}

async function hydrateBloc(
    artifact: DeclarativeArtifactTemplate,
    versionRoot: string,
): Promise<DeclarativeArtifactTemplate> {
    if (artifact.type !== "bloc" || artifact.bloc.viewJS) return artifact;
    if (!artifact.bloc.path) throw new Error(`Bloc artifact "${artifact.bloc.tag}" requires path or viewJS`);
    const blocRoot = await resolveExistingPathWithin(versionRoot, "bloc", artifact.bloc.path);
    const viewJS = await readFile(await resolveExistingPathWithin(
        blocRoot,
        "bloc",
        artifact.bloc.view ?? "Bloc.ts",
    ), "utf-8");
    const editorJS = await readOptionalEditor(blocRoot, artifact.bloc.editor);
    return {
        ...artifact,
        bloc: {
            ...artifact.bloc,
            viewJS,
            ...(editorJS !== undefined ? { editorJS } : {}),
            source: await readSourceBundle(blocRoot),
        },
    };
}

async function readOptionalEditor(root: string, editor: string | null | undefined): Promise<string | null | undefined> {
    if (editor === null) return null;
    try {
        return await readFile(await resolveExistingPathWithin(root, "bloc", editor ?? "BlocEditor.ts"), "utf-8");
    } catch (error) {
        if (editor === undefined && isNodeError(error) && error.code === "ENOENT") return undefined;
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
        if (!entry.isDirectory() && !entry.isFile()) continue;
        const absolutePath = await resolveExistingPathWithin(dir, "bloc", entry.name);
        if (entry.isDirectory()) await readSourceDirectory(root, absolutePath, out);
        else {
            const key = relative(root, absolutePath).split(sep).join("/");
            out[key] = Buffer.from(await readFile(absolutePath)).toString("base64");
        }
    }
}
