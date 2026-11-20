import type { GatewayInvoker } from "@bernouy/cms-gateway";

/** The browser never receives credentials. Signed/public URLs retain normal Files authorization. */
export async function readCaptureFile(
    invoker: GatewayInvoker,
    siteId: string,
    path: string,
    signal?: AbortSignal,
): Promise<Response> {
    const url = new URL(path, "https://capture.invalid");
    const match =
        /^\/\.cms\/call\/ulvia\/cms\.files\/files\/([^/]+)\/([^/]+)(?:\/representations\/([^/]+)\/(\d+)\.webp)?$/u.exec(
            url.pathname,
        );
    if (
        !match ||
        [...url.searchParams.keys()].some((name) => name !== "access") ||
        url.searchParams.getAll("access").length > 1
    ) {
        return new Response(null, { status: 404 });
    }
    const representation = match[3] !== undefined;
    const result = await invoker.invoke({
        siteId,
        contractId: "ulvia/cms.files",
        capabilityId: representation ? "representations.read" : "files.read",
        actor: { kind: "anonymous" },
        signal,
        input: {
            fileId: decodeURIComponent(match[1]!),
            generation: decodeURIComponent(match[2]!),
            ...(url.searchParams.has("access") ? { access: url.searchParams.get("access") } : {}),
            ...(representation ? { profile: decodeURIComponent(match[3]!), width: Number(match[4]) } : {}),
        },
    });
    if (result.kind !== "binary") {
        return new Response(null, { status: 404 });
    }
    return new Response(result.stream, {
        headers: { "content-type": result.contentType, "cache-control": "private, no-store" },
    });
}
