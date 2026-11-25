import { ContentDelivery, type ContentDeliveryOptions } from "../ContentDelivery";
import type ContentDeliveryHost from "../interfaces";
import type { MaintenancePage } from "./interfaces";
import { renderPage } from "../html/renderPage";
import { makeRuntimeRenderContext } from "../html/runtimeContext";
import { pageRequiresCapabilityAnalysis } from "../access/PageCapabilityAnalyzer";
import { freezeMaintenanceResources } from "./resources";
import { MAINTENANCE_HTML } from "./limits";

export async function prepareMaintenancePage(
    options: ContentDeliveryOptions,
    assetPrefix: string,
    signal: AbortSignal,
): Promise<MaintenancePage> {
    const delivery = new ContentDelivery(options);
    const read = async (path: string) => {
        const url = new URL(path, options.publicUrl);
        if (url.pathname.startsWith("/_content/") || url.pathname === "/favicon.ico") {
            return delivery.resolvePath(
                {
                    path: url.pathname,
                    method: "GET",
                    query: [...url.searchParams].map(([name, value]) => ({ name, value })),
                },
                { kind: "anonymous" },
                undefined,
                { signal },
            );
        }
        // Signed/private resources must never become a shared maintenance artifact.
        return url.searchParams.has("access")
            ? new Response(null, { status: 403 })
            : (options.readCaptureResource?.(path, signal) ?? new Response(null, { status: 404 }));
    };
    const host: ContentDeliveryHost = {
        ...options,
        basePath: "",
        cmsPathPrefix: "/_content",
        resolveActor: async () => ({ kind: "anonymous" }),
    };
    try {
        const settings = await options.content.getRenderingSettings();
        if (settings.site.visible) {
            for (const field of ["serverError", "notFound"] as const) {
                try {
                    signal.throwIfAborted();
                    const ref = settings.site[field];
                    const path = ref ? await options.content.resolvePageReference(ref) : null;
                    const renderable = path ? await options.content.getRenderablePage(path) : null;
                    if (!renderable || !renderable.page.visible) {
                        continue;
                    }
                    const access = pageRequiresCapabilityAnalysis(renderable)
                        ? await options.pageCapabilities?.requiredAccess(renderable)
                        : "public";
                    if (access !== "public") {
                        continue;
                    }
                    const entry = await renderPage(renderable.page, makeRuntimeRenderContext(host), {
                        canonical: null,
                        indexable: false,
                    });
                    return await freezeMaintenanceResources(
                        new TextDecoder().decode(entry.raw),
                        new URL(path!, options.publicUrl).href,
                        assetPrefix,
                        read,
                        signal,
                    );
                } catch (error) {
                    options.logger.warn("delivery.maintenance.prepare.failed", { field }, error);
                }
            }
        }
    } catch (error) {
        options.logger.warn("delivery.maintenance.settings.failed", {}, error);
    }
    return { html: MAINTENANCE_HTML, resources: [] };
}
