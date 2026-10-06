import { createContentReader, pageDocument } from "@bernouy/cms-content";
import { renderPageDocument } from "@bernouy/cms-content/rendering";
import { prepareNetworkInertBindings } from "@bernouy/components/binding-dom";
import { resolveCollectionTranslation } from "@bernouy/cms-repository/collections";
import { compress, sendCompressed } from "@bernouy/http-runner";
import { parseHTML } from "linkedom";
import type { ControlCmsState } from "cms-control/core/admin/control/types";
import { requestLocale } from "cms-control/core/admin/http/requestLocale";
import { resolvePreviewCollectionAssets } from "cms-control/core/content/bloc/preview/assets";
import { controlAssetPath } from "./paths";
import type { ControlPageSnapshot, InstalledControlPage } from "./registry";
import { resolveControlPageLinks } from "./pageLinks";

export async function renderControlPage(
    request: Request,
    state: ControlCmsState,
    snapshot: ControlPageSnapshot,
    selected: InstalledControlPage,
): Promise<Response> {
    const { document } = parseHTML("<!doctype html><html><head></head><body></body></html>");
    const system = selected.kind === "site" ? await state.repository.getSystem() : null;
    const fallbackLocale =
        selected.kind === "collection" ? selected.installation.release.locale : system?.site.language || "en";
    const language = requestLocale(request, fallbackLocale);
    const title =
        selected.kind === "collection"
            ? resolveCollectionTranslation(selected.installation.release, selected.page.name, language)
            : selected.page.title;
    const reader = createContentReader(state.repository);
    const releases = snapshot.collections.map(({ release }) => release);
    const selectedDocument = selected.kind === "collection" ? selected.page.document : pageDocument(selected.page);
    const rendered = await renderPageDocument(document.body, selectedDocument, {
        repository: reader,
        language,
        ...(state.configuration.deliveryUrl
            ? {
                  resolveCollectionAssets: (input: string) =>
                      resolvePreviewCollectionAssets(input, releases, state.configuration.deliveryUrl!),
              }
            : {}),
        prepareBody: prepareNetworkInertBindings,
    });
    await resolveControlPageLinks(document, state);

    document.documentElement.lang = language;
    document.title = title;
    appendMeta(document, "charset", "utf-8");
    appendMeta(document, "name", "viewport", "content", "width=device-width, initial-scale=1");
    appendMeta(document, "name", "basePath", "content", state.runner.basePath);
    appendStylesheet(document, controlAssetPath(state.runner.basePath, "/assets/control-styles.css"));
    appendStylesheet(document, controlAssetPath(state.runner.basePath, "/.cms/style"));
    appendScript(document, controlAssetPath(state.runner.basePath, "/assets/control-components.js"));
    if (rendered.usedTags.length > 0) {
        const tags = [...new Set(rendered.usedTags)].sort().join(",");
        const query = new URLSearchParams({ tags, r: String(snapshot.revision) });
        appendScript(document, controlAssetPath(state.runner.basePath, `/.cms/blocset?${query}`));
    }
    return sendCompressed(request, compress(document.toString(), "text/html; charset=utf-8"), "private, no-store");
}

function appendMeta(
    document: Document,
    key: "charset" | "name",
    value: string,
    contentKey?: "content",
    content?: string,
): void {
    const meta = document.createElement("meta");
    meta.setAttribute(key, value);
    if (contentKey && content !== undefined) {
        meta.setAttribute(contentKey, content);
    }
    document.head.append(meta);
}

function appendStylesheet(document: Document, href: string): void {
    const link = document.createElement("link");
    link.rel = "stylesheet";
    link.href = href;
    document.head.append(link);
}

function appendScript(document: Document, src: string): void {
    const script = document.createElement("script");
    script.src = src;
    script.defer = true;
    document.body.append(script);
}
