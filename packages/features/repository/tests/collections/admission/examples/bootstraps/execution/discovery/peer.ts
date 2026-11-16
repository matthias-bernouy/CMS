import { HttpCollectionRepository } from "@bernouy/repository/collections/http";
import type { RepositoryFetch } from "@bernouy/repository/collections/http";
import type { FilesystemRepositoryCatalogueIndex } from "repository/repository/filesystem/catalogueIndex";
import { RepositoryRequestError } from "repository/repository/core/errors";

type DiscoveryIntercept = (...args: Parameters<RepositoryFetch>) => Promise<Response | undefined>;

export function discoveryPeer(
    index: FilesystemRepositoryCatalogueIndex,
    entries: unknown[],
    releases: Map<string, string>,
) {
    const requests: { path: string; method: string; input: Record<string, unknown> }[] = [];
    const observed = {
        catalogueEntries: 0,
        releaseBytes: 0,
        verifications: 0,
        intercept: undefined as DiscoveryIntercept | undefined,
    };
    const source = new HttpCollectionRepository("official", "https://repository.example", {
        request: async (url, init) => {
            const path = url.pathname.replace("/.cms/call/ulvia/repository", "");
            const input = init.body ? JSON.parse(String(init.body)) : {};
            requests.push({ path, method: init.method ?? "GET", input });
            const intercepted = await observed.intercept?.(url, init);
            if (intercepted) {
                return intercepted;
            }
            if (path === "/v1/recipes") {
                try {
                    return Response.json(await index.recipePage(input, init.signal ?? undefined));
                } catch (error) {
                    if (error instanceof RepositoryRequestError) {
                        return Response.json(
                            { error: { code: error.code } },
                            { status: error.code === "REJECTED" ? 409 : 503 },
                        );
                    }
                    throw error;
                }
            }
            if (path === "/v1/catalogue") {
                const offset = input.cursor ? Number(String(input.cursor).slice(5)) : 0;
                const page = entries.slice(offset, offset + Number(input.limit));
                observed.catalogueEntries += page.length;
                return Response.json({
                    releases: page,
                    ...(offset + page.length < entries.length ? { nextCursor: `page_${offset + page.length}` } : {}),
                });
            }
            const json = releases.get(path);
            if (!json) {
                throw new Error(`Unexpected discovery request: ${path}`);
            }
            observed.releaseBytes += Buffer.byteLength(json);
            return new Response(json, { headers: { "content-type": "application/json" } });
        },
    });
    return { source, observed, requests };
}
