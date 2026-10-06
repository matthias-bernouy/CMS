import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertValidJavaScriptArtifact, materializeSourceBundle, resolveSourceEntryPath, runBuild } from "./buildFiles";
import { collectionSourceBoundaryPlugin, hostRuntimeExternalsPlugin } from "./hostRuntimeExternalsPlugin";
import { validateBlocTag } from "./validateBloc";
import { writeViewRegistrationEntry } from "./viewRegistrationEntry";

export interface CollectionBlocBuildInput {
    /** Admitted collection Bloc tag used by the generated custom-element registration. */
    readonly tag: string;
    /** TypeScript or JavaScript source for the component's browser behavior. */
    readonly viewSource: string;
    /** Base64-encoded files available to relative imports from the view source. */
    readonly source?: Readonly<Record<string, string>>;
    /** Relative entry path inside the supplied source bundle. */
    readonly viewPath?: string;
}

export interface CollectionBlocBuildArtifact {
    readonly viewJS: string;
}

/** Compile one collection component's browser runtime without admitting or persisting it. */
export async function buildCollectionBloc(input: CollectionBlocBuildInput): Promise<CollectionBlocBuildArtifact> {
    const tagIssue = validateBlocTag(input.tag);
    if (tagIssue) {
        throw new Error(tagIssue);
    }
    const tempDir = await mkdtemp(join(tmpdir(), "cms-collection-bloc-"));
    try {
        await materializeSourceBundle(tempDir, input.source);
        const viewPath = resolveSourceEntryPath(tempDir, input.viewPath ?? "bloc.ts");
        await Bun.write(viewPath, input.viewSource);
        const entryPath = await writeViewRegistrationEntry(tempDir, viewPath);
        const viewJS = (
            await runBuild(
                {
                    entrypoints: [entryPath],
                    target: "browser",
                    format: "iife",
                    minify: true,
                    plugins: [hostRuntimeExternalsPlugin, collectionSourceBoundaryPlugin(tempDir)],
                },
                `view bundle for ${input.tag}`,
            )
        ).replaceAll("BE5_TAG_TO_BE_REPLACED", input.tag);
        assertValidJavaScriptArtifact(viewJS, `view bundle for ${input.tag}`);
        return { viewJS };
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => null);
    }
}
