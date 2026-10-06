import {
    FilesystemRepositoryPublicationRegistry,
    FilesystemRepositoryPublicationUploadStore,
    FilesystemRepositoryReplayStore,
    FilesystemRepositoryCatalogueIndex,
    recoverRepositoryStorage,
    RepositoryReadEndpoint,
} from "@bernouy/cms-repository/repository/filesystem";
import { RepositoryMutationEndpoint } from "@bernouy/cms-repository/repository/publication";
import { probeOfficialRepositoryStorage, validateOfficialRepositoryStorage } from "./storage";

export type OfficialRepositoryApplication = Readonly<{
    handle(request: Request): Promise<Response>;
}>;

export async function createOfficialRepositoryApplication(
    root: string,
    token: string,
): Promise<OfficialRepositoryApplication> {
    const index = new FilesystemRepositoryCatalogueIndex(root);
    await validateOfficialRepositoryStorage(root, index);
    await recoverRepositoryStorage(root);
    const uploads = new FilesystemRepositoryPublicationUploadStore(root);
    await uploads.recover();
    const reads = new RepositoryReadEndpoint(root, index);
    const mutations = new RepositoryMutationEndpoint(new FilesystemRepositoryPublicationRegistry(root, index), {
        token,
        uploads,
        replays: new FilesystemRepositoryReplayStore(root),
    });
    return {
        async handle(request) {
            const url = new URL(request.url);
            if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/healthz") {
                return harden(request, healthResponse(request.method));
            }
            if ((request.method === "GET" || request.method === "HEAD") && url.pathname === "/readyz") {
                return harden(
                    request,
                    await readinessResponse(request.method, () => probeOfficialRepositoryStorage(root, index)),
                );
            }
            const response = (await mutations.handle(request)) ?? (await reads.handle(request));
            return harden(request, response ?? methodOrNotFound(request.method));
        },
    };
}

async function readinessResponse(method: string, check: () => Promise<void>): Promise<Response> {
    try {
        await check();
        return jsonStatus(method, 200, "ready");
    } catch {
        return jsonStatus(method, 503, "unavailable");
    }
}

function healthResponse(method: string): Response {
    return jsonStatus(method, 200, "ok");
}

function jsonStatus(method: string, status: number, value: string): Response {
    const headers = { "Cache-Control": "no-store", "Content-Type": "application/json; charset=utf-8" };
    return new Response(method === "HEAD" ? null : JSON.stringify({ status: value }), { status, headers });
}

function methodOrNotFound(method: string): Response {
    if (!["GET", "POST", "PUT", "DELETE", "HEAD"].includes(method)) {
        return new Response(null, { status: 405, headers: { Allow: "GET, HEAD, POST, PUT, DELETE" } });
    }
    return new Response(null, { status: 404 });
}

function harden(request: Request, response: Response): Response {
    const headers = new Headers(response.headers);
    headers.set("X-Content-Type-Options", "nosniff");
    headers.set("Referrer-Policy", "no-referrer");
    if (request.method === "GET" || request.method === "HEAD") {
        headers.set("Access-Control-Allow-Origin", "*");
        headers.set("Cross-Origin-Resource-Policy", "cross-origin");
    } else {
        headers.set("Cache-Control", "no-store");
    }
    return new Response(response.body, { status: response.status, statusText: response.statusText, headers });
}
