import { CMS_BINDING_ATTRIBUTES, CMS_BINDING_CORE_TAG } from "@bernouy/cms-content/editor";
import type { SiteBlocDefinition } from "@bernouy/cms-content";
import { CONTENT_REGION_ATTR } from "cms-control/core/editorSystemV2/contentRegionAttrs";
import { networkInertHtml } from "cms-control/core/editorSystemV2/networkInertHtml";
import { siteBlocStructureHtml } from "./structure";

export type SiteBlocFrameMode = "structure" | "default" | "preview";

export function renderSiteBlocFrame(basePath: string, definition: SiteBlocDefinition, mode: SiteBlocFrameMode): string {
    const revision = String(definition.draftRevision);
    const query = `id=${encodeURIComponent(definition.tag)}&revision=${revision}`;
    const scripts =
        mode === "structure"
            ? [`${basePath}/api/editor/component.js`, `${basePath}/api/editor/view-script.js`]
            : [
                  `${basePath}/api/editor/component.js`,
                  `${basePath}/api/editor/binding-core.js`,
                  `${basePath}/api/site-bloc/runtime/dependencies.js?${query}`,
                  `${basePath}/api/site-bloc/runtime/draft.js?${query}`,
              ];
    const content =
        mode === "structure" ? structureContent(definition) : instanceContent(definition, mode === "preview");
    return `<!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta name="basePath" content="${escapeHtml(basePath)}">
    <title>${escapeHtml(definition.draft.name)} · ${mode}</title>
    <link rel="stylesheet" href="${basePath}/.cms/style">
    <style>${frameStyle(mode)}</style>
    ${scripts.map((source) => `<script defer src="${escapeHtml(source)}"></script>`).join("\n    ")}
</head>
<body>${content}</body>
</html>`;
}

function structureContent(definition: SiteBlocDefinition): string {
    const publishedIds = new Set(definition.published?.slots.map((slot) => slot.id) ?? []);
    const html = siteBlocStructureHtml(definition.draft.structure, definition.draft.slots, publishedIds);
    return `<div data-cms-editor-root ${CONTENT_REGION_ATTR}>${networkInertHtml(html)}</div>`;
}

function instanceContent(definition: SiteBlocDefinition, live: boolean): string {
    const content = live ? definition.draft.defaultContent : networkInertHtml(definition.draft.defaultContent);
    const instance = `<${definition.tag} ${CONTENT_REGION_ATTR}>${content}</${definition.tag}>`;
    if (live) {
        return `<${CMS_BINDING_CORE_TAG}>${instance}</${CMS_BINDING_CORE_TAG}>`;
    }
    return `<${CMS_BINDING_CORE_TAG} ${CMS_BINDING_ATTRIBUTES.bindingDisabled} data-cms-editor-root>${instance}</${CMS_BINDING_CORE_TAG}>`;
}

function frameStyle(mode: SiteBlocFrameMode): string {
    const placeholder =
        mode === "structure"
            ? `
${"cms-site-slot-placeholder"} {
    display: grid;
    min-block-size: 4rem;
    place-items: center;
    border: 2px dashed #8b9b95;
    border-radius: .5rem;
    background: color-mix(in srgb, #eef5f2 84%, transparent);
}
${"cms-site-slot-placeholder"}::before {
    content: "Slot · " attr(data-slot-label);
    color: #315248;
    font: 600 .8rem/1.2 system-ui, sans-serif;
}`
            : "";
    return `html { color-scheme: light; }
body { margin: 0; min-height: 100vh; }
[data-cms-content] { display: block; min-height: 100vh; }
${placeholder}`;
}

export function siteBlocFrameMode(value: string | null): SiteBlocFrameMode {
    return value === "default" || value === "preview" ? value : "structure";
}

export function controlBasePath(pathname: string): string {
    const marker = "/api/site-bloc/frame";
    const index = pathname.indexOf(marker);
    return index <= 0 ? "" : pathname.slice(0, index);
}

function escapeHtml(value: string): string {
    return value.replaceAll("&", "&amp;").replaceAll("<", "&lt;").replaceAll(">", "&gt;").replaceAll('"', "&quot;");
}
