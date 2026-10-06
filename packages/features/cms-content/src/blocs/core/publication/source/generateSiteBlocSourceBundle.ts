import type { SiteBlocDefinition, SiteBlocSnapshot } from "cms-content/blocs/interfaces/blocs";
import { validateSiteBlocSnapshot } from "cms-content/blocs/core/validation";
import { canonicalSiteBlocDefinition, normalizeSiteBlocSnapshot } from "./canonicalSiteBloc";
import { serializeSiteBlocDefault, serializeSiteBlocTemplate } from "./siteBlocHtml";

export function generateSiteBlocSourceBundle(
    definition: SiteBlocDefinition,
    snapshot?: SiteBlocSnapshot,
): Record<"manifest.json" | "template.html" | "default.html" | "builder.json", string> {
    const selected = validateSiteBlocSnapshot(
        normalizeSiteBlocSnapshot(snapshot ?? publishedSnapshot(definition)),
        definition.tag,
    );
    return {
        "manifest.json": manifestSource(definition.tag, selected),
        "template.html": serializeSiteBlocTemplate(selected),
        "default.html": serializeSiteBlocDefault(definition.tag, selected.defaultContent),
        "builder.json": canonicalSiteBlocDefinition(definition),
    };
}

function publishedSnapshot(definition: SiteBlocDefinition): SiteBlocSnapshot {
    if (!definition.published || definition.publishedRevision === null) {
        throw new Error(`Site bloc "${definition.tag}" has no published snapshot`);
    }
    return definition.published;
}

function manifestSource(tag: string, snapshot: SiteBlocSnapshot): string {
    return `${JSON.stringify(
        {
            "default-tag": tag,
            composition: "./template.html",
            defaultContent: "./default.html",
            meta: { title: snapshot.name, description: snapshot.description },
        },
        null,
        4,
    )}\n`;
}
