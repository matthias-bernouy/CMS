import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { assertValidJavaScriptArtifact, materializeSourceBundle, resolveSourceEntryPath, runBuild } from "./buildFiles";
import { blocRuntimeExternalsPlugin, collectionSourceBoundaryPlugin } from "./blocRuntimeExternalsPlugin";
import { validateBloc } from "./validateBloc";
import { writeViewRegistrationEntry } from "./viewRegistrationEntry";

export interface CollectionBlocBuildInput {
    /** Admitted collection Bloc identity used by the generated Light DOM registration. */
    readonly tag: string;
    /** Optional TypeScript or JavaScript source exporting `mount(root)`. */
    readonly viewSource?: string;
    /** Base64-encoded files available to relative imports from the view source. */
    readonly source?: Readonly<Record<string, string>>;
    /** Relative entry path inside the supplied source bundle. */
    readonly viewPath?: string;
    /** Declared Bloc dependencies whose CSS inputs may be written by this runtime. */
    readonly uses?: readonly string[];
}

export interface CollectionBlocBuildArtifact {
    readonly viewJS: string;
}

/** Compile one collection component's browser runtime without admitting or persisting it. */
export async function buildCollectionBloc(input: CollectionBlocBuildInput): Promise<CollectionBlocBuildArtifact> {
    const validation = validateBloc({
        tag: input.tag,
        ...(input.viewSource ? { viewSource: input.viewSource } : {}),
        ...(input.uses ? { uses: input.uses } : {}),
    });
    if (validation.errors.length > 0) {
        throw new Error(validation.errors.join("\n"));
    }
    const tempDir = await mkdtemp(join(tmpdir(), "cms-collection-bloc-"));
    try {
        await materializeSourceBundle(tempDir, input.source);
        const viewPath = input.viewSource ? resolveSourceEntryPath(tempDir, input.viewPath ?? "bloc.ts") : undefined;
        if (viewPath && input.viewSource) {
            await Bun.write(viewPath, input.viewSource);
        }
        const entryPath = await writeViewRegistrationEntry(tempDir, viewPath, input.tag);
        const viewJS = await runBuild(
            {
                entrypoints: [entryPath],
                target: "browser",
                format: "iife",
                minify: true,
                plugins: [blocRuntimeExternalsPlugin, collectionSourceBoundaryPlugin(tempDir)],
            },
            `view bundle for ${input.tag}`,
        );
        assertValidJavaScriptArtifact(viewJS, `view bundle for ${input.tag}`);
        return { viewJS };
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => null);
    }
}
