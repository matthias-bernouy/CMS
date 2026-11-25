import { freezeMaintenanceHtml } from "./html";
import type { MaintenancePage, MaintenanceResource } from "./interfaces";
import { MAINTENANCE_LIMITS } from "./limits";
import { readMaintenanceResource } from "./read";

/** Freeze local visual dependencies without fetching remote URLs or running authored scripts. */
export async function freezeMaintenanceResources(
    html: string,
    pageUrl: string,
    assetPrefix: string,
    read: (path: string) => Promise<Response>,
    signal: AbortSignal,
): Promise<MaintenancePage> {
    const base = new URL(pageUrl);
    if (!/^\/_content\/maintenance\/[0-9a-f]{64}$/u.test(assetPrefix)) {
        throw new TypeError("Invalid maintenance asset prefix");
    }
    const resources: MaintenanceResource[] = [];
    const queue: URL[] = [];
    const urls = new Map<string, string>();
    let bytes = new TextEncoder().encode(html).byteLength;
    const check = () => {
        signal.throwIfAborted();
        if (bytes > MAINTENANCE_LIMITS.bytes) {
            throw new Error("Maintenance Page exceeds its byte limit");
        }
    };
    const rewrite = (value: string, from: URL): string => {
        if (!value || value.startsWith("#") || value.startsWith("data:")) {
            return value;
        }
        const url = new URL(value, from);
        if (url.origin !== base.origin) {
            return url.href;
        }
        const hash = url.hash;
        url.hash = "";
        let frozen = urls.get(url.href);
        if (!frozen) {
            if (queue.length >= MAINTENANCE_LIMITS.resources) {
                throw new Error("Maintenance Page exceeds its resource limit");
            }
            frozen = `${assetPrefix}/${queue.length}`;
            urls.set(url.href, frozen);
            queue.push(url);
        }
        return frozen + hash;
    };
    const css = (text: string, from: URL) =>
        text.replace(/url\(\s*["']?([^\s"')]+)["']?\s*\)|@import\s+["']([^"']+)["']/gu, (_match, url, imported) =>
            imported ? `@import "${rewrite(imported, from)}"` : `url("${rewrite(url, from)}")`,
        );
    const frozen = freezeMaintenanceHtml(html, base, rewrite, css);
    for (let index = 0; index < queue.length; index++) {
        check();
        const url = queue[index]!;
        const response = await read(url.pathname + url.search);
        const { contentType, blob } = await readMaintenanceResource(response, signal, (size) => {
            bytes += size;
            check();
        });
        const data = contentType.startsWith("text/css")
            ? new TextEncoder().encode(css(await blob.text(), url))
            : new Uint8Array(await blob.arrayBuffer());
        if (data.byteLength > MAINTENANCE_LIMITS.resourceBytes) {
            throw new Error("Rewritten maintenance resource exceeds its byte limit");
        }
        bytes += data.byteLength - blob.size;
        resources.push({ contentType, bytes: data });
    }
    bytes += new TextEncoder().encode(frozen).byteLength - new TextEncoder().encode(html).byteLength;
    check();
    return { html: frozen, resources };
}
