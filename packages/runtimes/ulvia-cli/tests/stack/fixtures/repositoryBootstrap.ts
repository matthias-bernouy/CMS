import { repositoryApi } from "../../../../../../tests/integration/instance/repository/client";
import { runCli } from "../../../src/cli";

/** Loopback ingress for host CLI clients whose OS does not resolve *.localhost. No domain behavior is mocked. */
export async function publishSmokeRepository(environment: Record<string, string | undefined>, bridgePort: number) {
    const proxy = `http://127.0.0.1:${environment.ULVIA_HTTP_PORT}`;
    const registryOrigin = `http://registry.localhost:${environment.ULVIA_HTTP_PORT}`;
    const bridge = Bun.serve({
        hostname: "127.0.0.1",
        port: bridgePort,
        fetch(request) {
            const incoming = new URL(request.url);
            const headers = new Headers(request.headers);
            headers.set("host", new URL(registryOrigin).host);
            if (headers.has("origin")) {
                if (headers.get("origin") !== bridge.url.origin) {
                    return new Response(null, { status: 403 });
                }
                headers.set("origin", registryOrigin);
            }
            return fetch(`${proxy}${incoming.pathname}${incoming.search}`, {
                method: request.method,
                headers,
                redirect: "manual",
                ...(request.method === "GET" || request.method === "HEAD" ? {} : { body: request.body }),
                signal: AbortSignal.any([request.signal, AbortSignal.timeout(120_000)]),
            });
        },
    });
    try {
        const api = repositoryApi(bridge.url.origin);
        const account = await api.signup("smoke-publisher@example.test", "Smoke-publisher-long-password");
        if (account.administrator) {
            throw new Error("Smoke publisher must be an ordinary account");
        }
        const pat = await api.pat(account.cookie);
        const options = { environment: { ...environment, ULVIA_REPOSITORY_TOKEN: pat.token }, log: () => undefined };
        await runCli(["repository", "login", bridge.url.origin], options);
        await runCli(["namespace", "claim", "ulvia"], options);
        await runCli(["namespace", "claim", "ulvia.test"], options);
        await runCli(["push", "all"], options);
        await runCli(["repository", "logout"], options);
    } finally {
        bridge.stop(true);
    }
}
