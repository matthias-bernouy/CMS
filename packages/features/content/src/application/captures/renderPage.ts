import type { CaptureDocument } from "@bernouy/browser-capture";
import type { TPage } from "content/pages/interfaces/pages";
import type { ContentDeliveryHost } from "content/exports/runtime/public-delivery";
import { renderPage } from "content/pages/delivery/html/renderPage";
import { makeRuntimeRenderContext } from "content/pages/delivery/html/runtimeContext";
import { bundleCaptureResources } from "./resources";

/** Uses the live Page renderer with a private editorial snapshot, never a draft public reader. */
export async function renderPageCapture(
    page: TPage,
    host: ContentDeliveryHost,
    options: {
        locale: string;
        themeMode: "light" | "dark";
        publicUrl: string;
        readResource(path: string): Promise<Response>;
        signal?: AbortSignal;
    },
): Promise<CaptureDocument> {
    const locale = Intl.getCanonicalLocales(options.locale)[0];
    if (!locale) {
        throw new TypeError("Invalid capture locale");
    }
    const entry = await renderPage(page, makeRuntimeRenderContext(host), { language: locale, indexable: false });
    const html = new TextDecoder().decode(entry.raw).replace("<html", `<html data-theme-mode="${options.themeMode}"`);
    return bundleCaptureResources(html, options.publicUrl, page.path, options.readResource, options.signal);
}
