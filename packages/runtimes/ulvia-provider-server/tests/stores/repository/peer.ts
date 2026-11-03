import type { RepositoryNamespaceView } from "@bernouy/cms-repository/repository/namespaces";

/** Transport peer only; actual account and publication journeys run against Edge and Provider. */
export function repositoryPeer() {
    const token = `pat_${"a".repeat(43)}`;
    const state = {
        repositoryId: "repository-test",
        revoked: false,
        redirect: false,
        entries: [] as RepositoryNamespaceView[],
        calls: [] as { path: string; authorization: string | null }[],
    };
    const server = Bun.serve({
        hostname: "127.0.0.1",
        port: 0,
        async fetch(request) {
            const path = new URL(request.url).pathname.replace("/.cms/call/ulvia.repository/", "");
            state.calls.push({ path, authorization: request.headers.get("authorization") });
            if (path === "v1/info") {
                return Response.json({ repositoryId: state.repositoryId, protocol: "ulvia-repository/v2" });
            }
            if (state.redirect) {
                return Response.redirect(`${server.url}unexpected`, 307);
            }
            if (state.revoked || request.headers.get("authorization") !== `Bearer ${token}`) {
                return Response.json({ error: { code: "UNAUTHORIZED" } }, { status: 401 });
            }
            if (path === "v1/namespaces") {
                return Response.json({ namespaces: state.entries });
            }
            if (path === "v1/namespace-actions/claim") {
                const input = (await request.json()) as { namespace: string };
                const value: RepositoryNamespaceView = {
                    namespace: input.namespace,
                    revision: 1,
                    state: "active",
                    updatedAt: new Date().toISOString(),
                };
                state.entries.push(value);
                return Response.json(value);
            }
            return new Response(null, { status: 404 });
        },
    });
    return { state, token, url: server.url.origin, close: () => server.stop(true) };
}
