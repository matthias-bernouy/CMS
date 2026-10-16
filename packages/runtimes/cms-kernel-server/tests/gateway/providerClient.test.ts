import { expect, test } from "bun:test";
import { ProviderKernelClient } from "../../src/runtime/provider/ProviderKernelClient";
import { ProviderKernelTransport } from "../../src/runtime/provider/ProviderKernelTransport";

interface CapturedRequest {
    url: URL;
    init: RequestInit;
    body?: { operation?: string; input?: unknown };
}

function clientFixture(
    respond: (request: CapturedRequest) => Response | Promise<Response>,
    kernelUrl = "https://kernel.test",
): { client: ProviderKernelClient; requests: CapturedRequest[] } {
    const requests: CapturedRequest[] = [];
    const fetcher = async (url: string | URL | Request, init?: RequestInit): Promise<Response> => {
        const captured: CapturedRequest = {
            url: new URL(url.toString()),
            init: init ?? {},
            body: typeof init?.body === "string" ? JSON.parse(init.body) : undefined,
        };
        requests.push(captured);
        return respond(captured);
    };
    const transport = new ProviderKernelTransport(
        "http://ulvia-provider:5103",
        "provider-token-at-least-twenty",
        fetcher as typeof fetch,
    );
    return { client: new ProviderKernelClient(transport, kernelUrl), requests };
}

test("projects every content read through the versioned Provider query endpoint", async () => {
    const { client, requests } = clientFixture((request) => {
        if (request.body?.operation === "content.texts") {
            return Response.json({
                value: {
                    defaultLocale: "en",
                    sources: [{ namespace: "shop", catalogues: { en: { title: "Shop" }, fr: { title: "Boutique" } } }],
                },
            });
        }
        return Response.json({ value: request.body?.operation });
    });

    const texts = await client.content.getContentTexts();
    expect(texts[0]?.resolve("fr")).toEqual({ title: "Boutique" });
    expect(texts[0]?.resolve("de")).toEqual({ title: "Shop" });
    await client.content.getContentRevision();
    await client.content.getRenderablePage("/about");
    await client.content.getRenderablePages();
    await client.content.resolvePageReference({ path: "/about" });
    await client.content.resolvePagePaths(["/about"]);
    await client.content.resolveRenderableRoute("/about");
    await client.content.getPublishedPage("/about");
    await client.content.getPublishedPageById("page-a");
    await client.content.getPublishedPages();
    await client.content.resolvePublishedRoute("/about");
    await client.content.getRenderableBlocs();
    await client.content.getBlocViewJS("shop-card");
    await client.content.getRenderingSettings();

    expect(requests.map((request) => request.body?.operation)).toEqual([
        "content.texts",
        "content.revision",
        "content.renderable-page",
        "content.renderable-pages",
        "content.resolve-page-reference",
        "content.resolve-page-paths",
        "content.resolve-renderable-route",
        "content.published-page",
        "content.published-page-by-id",
        "content.published-pages",
        "content.resolve-published-route",
        "content.renderable-blocs",
        "content.bloc-view-js",
        "content.rendering-settings",
    ]);
    expect(requests.every((request) => request.url.pathname === "/ulvia/kernel/v1/query")).toBe(true);
});

test("projects authentication behavior without exposing Provider credentials", async () => {
    const { client, requests } = clientFixture((request) => {
        const path = request.url.pathname;
        if (path.endsWith("/auth/login")) {
            return Response.json(
                { subject: { identifier: "subject-a" }, cookie: "cms-session=session-a" },
                { headers: { "set-cookie": "ignored-by-client" } },
            );
        }
        if (path.endsWith("/auth/signup")) {
            return new Response(null, { status: 204 });
        }
        return Response.json({ value: { identifier: "subject-a" } });
    });

    expect(client.authentication.buildLoginUrl("/admin?a=1")).toBe("/login?returnTo=%2Fadmin%3Fa%3D1");
    expect(client.authentication.buildLogoutUrl("/bye")).toBe("/auth/logout?returnTo=%2Fbye");
    await client.authentication.getSubject(
        new Request("https://kernel.test/admin", {
            headers: { authorization: "Bearer actor", cookie: "cms-session=session-a" },
        }),
    );
    expect(await client.localAuthentication.authenticate("admin@example.test", "password")).toEqual({
        ok: true,
        subject: { identifier: "subject-a" },
        cookie: "cms-session=session-a",
    });
    expect(client.localAuthentication.clearSession()).toContain("; Secure");
    expect(client.publicAuth.buildLoginUrl("/admin")).toBe("/login?returnTo=%2Fadmin");
    expect((await client.publicAuth.login(new Request("https://kernel.test/login"))).status).toBe(200);
    expect((await client.publicAuth.logout()).headers.get("set-cookie")).toContain("Max-Age=0");
    await client.publicAuth.subject(new Request("https://kernel.test/profile"));
    await client.publicAuth.signup({ email: "new@example.test", password: "password" });

    const subjectQuery = requests.find((request) => request.body?.operation === "auth.subject");
    expect(subjectQuery?.body?.input).toEqual({
        cookie: "cms-session=session-a",
        authorization: "Bearer actor",
    });
    expect(new Headers(requests[0]?.init.headers).get("authorization")).toBe("Bearer provider-token-at-least-twenty");
});

test("normalizes remote authentication failures and forwards public account actions", async () => {
    let loginAttempt = 0;
    const { client, requests } = clientFixture((request) => {
        if (request.url.pathname.endsWith("/auth/login")) {
            loginAttempt += 1;
            if (loginAttempt === 1) {
                return Response.json({ error: "rate_limited" }, { status: 429 });
            }
            if (loginAttempt === 2) {
                return Response.json({ subject: { identifier: "subject-a" } });
            }
            return Response.json({ error: "invalid_credentials" }, { status: 401 });
        }
        return new Response(null, { status: 204 });
    }, "http://kernel.test");

    expect(await client.localAuthentication.authenticate("admin@example.test", "wrong")).toEqual({
        ok: false,
        error: "rate_limited",
    });
    expect(await client.localAuthentication.authenticate("admin@example.test", "password")).toEqual({
        ok: false,
        error: "invalid_credentials",
    });
    expect(client.localAuthentication.clearSession()).not.toContain("; Secure");
    const failedLogin = await client.publicAuth.login(new Request("http://kernel.test/login"));
    expect(failedLogin.status).toBe(401);
    expect(await failedLogin.json()).toEqual({ error: "invalid_credentials" });
    await client.publicAuth.requestEmailVerification({ email: "admin@example.test" });
    await client.publicAuth.confirmEmailVerification({ token: "token" });
    await client.publicAuth.requestPasswordReset({ email: "admin@example.test" });
    await client.publicAuth.confirmPasswordReset({ token: "token", password: "new-password" });

    expect(requests.map((request) => request.url.pathname)).toContain("/ulvia/kernel/v1/auth/confirm-password-reset");
});

test("rejects failed Provider queries and public authentication actions", async () => {
    const { client } = clientFixture((request) =>
        request.url.pathname.endsWith("/query")
            ? Response.json({ error: "not_ready" }, { status: 503 })
            : Response.json({ error: "invalid" }, { status: 400 }),
    );

    await expect(client.query("content.revision")).rejects.toThrow("Provider query failed (503)");
    await expect(client.publicAuth.signup({ email: "new@example.test", password: "password" })).rejects.toThrow(
        "Provider authentication failed (400)",
    );
});

test("projects gateway, Page access, collection assets and identity providers", async () => {
    const providers = [{ id: "local", label: "Local", type: "local", enabled: true }];
    const { client, requests } = clientFixture((request) =>
        Response.json({ value: request.body?.operation === "auth.identity-providers" ? providers : true }),
    );

    await client.pageExecution.requiredAccess(
        { page: { path: "/admin" } } as never,
        new URL("https://kernel.test/admin"),
    );
    await expect(client.pageExecution.authorizeCall({} as never, {} as never)).rejects.toThrow(
        "Capability authorization is owned by the Provider",
    );
    await client.gateway.invoker.invoke({} as never);
    await client.gateway.invoker.resolveHttp({} as never);
    await client.gateway.isAdministrator({ identifier: "subject-a" });
    await client.collectionAssets.store.getInstalledAssetMetadata("ignored", "collection-a", "asset-a");
    await client.collectionAssets.store.getInstalledAssetMetadataBatch("ignored", [
        {
            collectionId: "collection-a",
            assetId: "asset-a",
        },
    ]);
    await expect(client.collectionAssets.store.getReleaseAsset("collection-a", "1.0.0", "asset-a")).rejects.toThrow(
        "Collection asset bytes are streamed through the Provider proxy",
    );
    expect(await client.identityProviders.list()).toEqual(providers);
    expect(await client.identityProviders.get("local")).toEqual(providers[0]);
    expect(await client.identityProviders.get("missing")).toBeNull();
    await expect(client.identityProviders.create({} as never)).rejects.toThrow(
        "Identity provider mutations are owned by the Provider",
    );
    await expect(client.identityProviders.update("local", {} as never)).rejects.toThrow(
        "Identity provider mutations are owned by the Provider",
    );
    await expect(client.identityProviders.delete("local")).rejects.toThrow(
        "Identity provider mutations are owned by the Provider",
    );

    expect(requests.map((request) => request.body?.operation)).toContain("assets.metadata-batch");
});

test("forwards every streaming endpoint with its canonical Provider path", async () => {
    const { client, requests } = clientFixture(() => new Response("ok"));
    await client.capability(new Request("https://kernel.test/.cms/call/catalog.items/list?limit=10"));
    await client.declarativeQuery(
        new Request("https://kernel.test/.cms/query/catalog.items/list", { method: "QUERY" }),
    );
    await client.collectionAsset(
        new Request("https://kernel.test/.cms/collections/collection-a/assets/logo.svg?download=1"),
    );
    await client.sitemap(new Request("https://kernel.test/sitemap-1.xml"));

    expect(requests.map((request) => `${request.url.pathname}${request.url.search}`)).toEqual([
        "/ulvia/kernel/v1/call/catalog.items/list?limit=10",
        "/ulvia/kernel/v1/queries/catalog.items/list",
        "/ulvia/kernel/v1/collections/collection-a/assets/logo.svg?download=1",
        "/ulvia/kernel/v1/sitemap/resource",
    ]);
    expect(new Headers(requests[3]?.init.headers).get("x-ulvia-original-path")).toBe("/sitemap-1.xml");
});
