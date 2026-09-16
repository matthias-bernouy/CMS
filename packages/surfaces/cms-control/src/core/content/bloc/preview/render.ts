import { serializeSiteBlocTemplate } from "@bernouy/cms-bloc-compile";
import {
    expandCompositions,
    findUsedBlocTags,
    hardenStoredHtml,
    type CmsRepository,
    type TBloc,
} from "@bernouy/cms-content";
import { parseHTML } from "linkedom";
import { resolveDefaultContent } from "cms-control/core/content/bloc/sourceBundle";
import {
    siteBlocDependencyGraph,
    transitiveDependencies,
} from "cms-control/core/content/siteBloc/validation/dependencies";
import { networkInertHtml } from "cms-control/core/editorSystemV2/networkInertHtml";
import { previewDocument } from "./document";

export async function blocPreview(
    repository: Pick<CmsRepository, "getBlocRecords">,
    tag: string,
    basePath: string,
    assets: { scripts: string[]; style: string } = { scripts: [], style: "" },
): Promise<Response> {
    const records = await repository.getBlocRecords();
    const record = records.find((item) => item.tag === tag);
    if (!record) {
        return new Response("Bloc not found", { status: 404, headers: { "Cache-Control": "private, no-store" } });
    }
    const draft = record.siteDefinition?.draft;
    const artifact = record.artifact;
    const defaultContent = draft ? undefined : resolveDefaultContent(artifact?.source).content;
    const content = draft ? `<${tag}>${draft.defaultContent}</${tag}>` : (defaultContent ?? `<${tag}></${tag}>`);
    const blocs = records.flatMap((item) => (item.artifact ? [item.artifact] : []));
    const compositions: Pick<TBloc, "id" | "compositionHTML">[] = blocs.filter((bloc) => bloc.id !== tag);
    if (draft) {
        compositions.push({ id: tag, compositionHTML: serializeSiteBlocTemplate(draft) });
    } else if (artifact) {
        compositions.push(artifact);
    }
    const { document } = parseHTML("<html><body></body></html>");
    document.body.innerHTML = hardenStoredHtml(content);
    expandCompositions(document.body, compositions, "editor");
    neutralizePreviewOnlyCustomElementState(document.body);
    const graph = siteBlocDependencyGraph(records);
    const needed = new Set([tag, ...findUsedBlocTags(document.body.innerHTML, blocs), ...(draft?.dependencies ?? [])]);
    for (const dependency of [...needed]) {
        for (const nested of transitiveDependencies(graph, dependency)) {
            needed.add(nested);
        }
    }
    const scripts = blocs
        .filter((bloc) => needed.has(bloc.id) && !(draft && bloc.id === tag))
        .map(
            (bloc) =>
                `try {\n${bloc.viewJS}\n} catch (error) { console.error(${JSON.stringify(`[bloc-preview] ${bloc.id}`)}, error); }`,
        );
    return previewDocument({
        basePath,
        title: draft?.name ?? artifact?.name ?? tag,
        content: networkInertHtml(hardenStoredHtml(document.body.innerHTML)),
        scripts: [...assets.scripts, ...scripts],
        style: assets.style,
    });
}

const CUSTOM_ELEMENT_RUNTIME_ATTRIBUTES = [
    "checked",
    "max",
    "maxlength",
    "min",
    "minlength",
    "pattern",
    "required",
    "selected",
    "src",
    "srcset",
    "value",
] as const;

function neutralizePreviewOnlyCustomElementState(root: ParentNode): void {
    for (const element of Array.from(root.querySelectorAll("*"))) {
        if (!element.localName.includes("-")) {
            continue;
        }
        element.removeAttribute("required");
        for (const attribute of CUSTOM_ELEMENT_RUNTIME_ATTRIBUTES) {
            const value = element.getAttribute(attribute);
            if (value && /\{\{|\}\}|#\{/u.test(value)) {
                element.removeAttribute(attribute);
            }
        }
    }
}
