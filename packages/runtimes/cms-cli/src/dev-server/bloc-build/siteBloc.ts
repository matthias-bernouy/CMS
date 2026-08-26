import type { DevBloc } from "cms-cli/dev-server/scan";
import { readSiteBlocDefinition } from "cms-cli/push/blocs/siteBuilder";
import { join } from "node:path";

export type SiteBlocScanOptions = {
    quiet?: boolean;
    strict?: boolean;
    snapshot?: "published" | "draft";
};

export async function scanSiteDevBloc(folder: string, options: SiteBlocScanOptions): Promise<DevBloc | null> {
    try {
        return await readSiteDevBloc(folder, options.snapshot ?? "published");
    } catch (error) {
        if (options.strict) {
            throw error;
        }
        if (!options.quiet) {
            console.warn(`[scan] ${error instanceof Error ? error.message : String(error)}`);
        }
        return null;
    }
}

export async function readSiteDevBloc(folder: string, target: "published" | "draft"): Promise<DevBloc> {
    const definition = await readSiteBlocDefinition(folder);
    const snapshot = target === "draft" ? definition.draft : definition.published;
    if (target === "published" && (!snapshot || definition.publishedRevision === null)) {
        throw new Error(`Site bloc "${definition.tag}" has no published snapshot`);
    }
    if (!snapshot) {
        throw new Error(`Site bloc "${definition.tag}" has no ${target} snapshot`);
    }
    return {
        folder,
        manifest: {
            "default-tag": definition.tag,
            composition: "./template.html",
            editor: "./BlocEditor.ts",
            defaultContent: "./default.html",
            meta: { title: snapshot.name, description: snapshot.description },
        },
        tag: definition.tag,
        label: snapshot.name,
        group: snapshot.group,
        description: snapshot.description,
        internal: false,
        ownership: structuredClone(definition.ownership),
        siteDefinition: definition,
        siteBuildSnapshot: snapshot,
        compositionPath: join(folder, "template.html"),
        editorEntry: join(folder, "BlocEditor.ts"),
        templatePath: join(folder, "template.html"),
    };
}
