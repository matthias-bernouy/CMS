import type { ContentReader } from "content/application/interfaces/ContentReader";
import type { MaintenancePage } from "./interfaces";
import { MAINTENANCE_HTML } from "./limits";
import { readMaintenanceResource } from "./read";
import { freezeMaintenanceResources } from "./resources";

/** Capture through the still-running source release, using its ordinary anonymous access checks. */
export async function captureMaintenancePage(
    content: ContentReader,
    publicUrl: string,
    assetPrefix: string,
    read: (path: string, signal: AbortSignal) => Promise<Response>,
    signal: AbortSignal,
): Promise<MaintenancePage> {
    const fallback = { html: MAINTENANCE_HTML, resources: [] };
    const publicRead = (path: string) => {
        const url = new URL(path, publicUrl);
        if (url.origin !== new URL(publicUrl).origin || url.searchParams.has("access")) {
            return Promise.resolve(new Response(null, { status: 403 }));
        }
        return read(url.pathname + url.search, signal);
    };
    const settings = await content.getRenderingSettings();
    if (!settings.site.visible) {
        return fallback;
    }
    for (const field of ["serverError", "notFound"] as const) {
        try {
            signal.throwIfAborted();
            const ref = settings.site[field];
            const path = ref ? await content.resolvePageReference(ref) : null;
            const page = path ? await content.getRenderablePage(path) : null;
            if (!page?.page.visible) {
                continue;
            }
            const response = await publicRead(path!);
            const { blob } = await readMaintenanceResource(response, signal, () => {}, "html");
            return await freezeMaintenanceResources(
                await blob.text(),
                new URL(path!, publicUrl).href,
                assetPrefix,
                publicRead,
                signal,
            );
        } catch {
            // A private, unavailable or oversized authored Page must never prevent the safe fallback.
        }
    }
    return fallback;
}
