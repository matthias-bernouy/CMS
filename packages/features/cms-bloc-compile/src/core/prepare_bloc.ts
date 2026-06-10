import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { p9rExternalsPlugin } from "./p9rExternalsPlugin";

/** Synthetic editor source for blocs deployed without their own Editor module.
 *  The bloc is registered as opaque: it still gets the default parent-level
 *  action bar, but its subtree is sealed at runtime. */
const OPAQUE_EDITOR_SRC = `
import { registerEditor_opaque } from "@bernouy/cms-control/editor";
registerEditor_opaque();
`;

/**
 * Builds a bloc's view + editor bundles from the uploaded files and stamps
 * the manifest tag into both via the `BE5_TAG_TO_BE_REPLACED` placeholder.
 * The caller must provide the tag — blocs are always keyed by their manifest
 * tag, never by a generated UUID.
 *
 * Uses a fresh per-call temp directory under `os.tmpdir()` so concurrent
 * imports don't race on the same `./tmp/<blocId>.js` files, and so we
 * never depend on the process cwd being writable.
 */
export async function prepare_bloc(
    fileView: File, fileEditor: File | null,
    label: string, group: string, description: string, blocId: string,
    source: Record<string, string> | undefined = undefined,
) {
    const tempDir = await mkdtemp(join(tmpdir(), "p9r-bloc-"));

    try {
        const buildOptions = (entry: string) => ({
            entrypoints: [entry],
            target: "browser" as const,
            format: "iife" as const,
            plugins: [p9rExternalsPlugin],
        });

        const viewPath   = join(tempDir, blocId + ".js");
        const editorPath = join(tempDir, blocId + "Editor.ts");

        await Bun.write(viewPath, fileView);
        if (fileEditor) await Bun.write(editorPath, fileEditor);
        else            await Bun.write(editorPath, OPAQUE_EDITOR_SRC);

        const [viewBuild, editorBuild] = await Promise.all([
            Bun.build(buildOptions(viewPath)),
            Bun.build(buildOptions(editorPath)),
        ]);

        let viewJS   = await viewBuild.outputs[0]?.text()   || "";
        let editorJS = await editorBuild.outputs[0]?.text() || "";

        viewJS = viewJS.replaceAll("BE5_TAG_TO_BE_REPLACED", blocId);

        editorJS = editorJS
            .replaceAll("BE5_TAG_TO_BE_REPLACED", blocId)
            .replaceAll("BE5_LABEL_TO_BE_REPLACED", label)
            .replaceAll("BE5_GROUP_TO_BE_REPLACED", group);

        return {
            id: blocId,
            editorJS: editorJS,
            viewJS: viewJS,
            name: label,
            group: group,
            description: description,
            ...(source ? { source } : {}),
        };
    } finally {
        await rm(tempDir, { recursive: true, force: true }).catch(() => null);
    }
}