import { afterAll, afterEach, beforeEach, describe, expect, test } from "bun:test";
import { handleConsentRequest } from "../connectors/supabase/functions/cms-consent/handler";
import { subjectClaimHash } from "../connectors/supabase/functions/cms-consent/core/auth";
import { publishedPageContentHash } from "../connectors/supabase/functions/cms-consent/core/publishedPages";

type DenoEnvironment = {
    delete(name: string): void;
    get(name: string): string | undefined;
    set(name: string, value: string): void;
};

const originalDeno = (globalThis as { Deno?: unknown }).Deno;
const originalFetch = globalThis.fetch;
const values = new Map<string, string>();
const environment: DenoEnvironment = {
    delete: (name) => values.delete(name),
    get: (name) => values.get(name),
    set: (name, value) => values.set(name, value),
};
(globalThis as { Deno?: { env: DenoEnvironment } }).Deno = { env: environment };

beforeEach(() => {
    environment.set("CMS_CONSENT_API_KEY", "cms-consent-test-key");
    environment.set("SUPABASE_SERVICE_ROLE_KEY", "service-role-test");
    environment.set("SUPABASE_URL", "https://project.supabase.test");
});

afterEach(() => {
    globalThis.fetch = originalFetch;
    values.clear();
});

afterAll(() => {
    (globalThis as { Deno?: unknown }).Deno = originalDeno;
});

describe("Consent Edge Function", () => {
    test("rejects an invalid CMS API key before any storage request", async () => {
        let calls = 0;
        globalThis.fetch = async () => {
            calls += 1;
            return Response.json({});
        };

        const response = await handleConsentRequest(request("/health", { authorization: "Bearer wrong" }));

        expect(response.status).toBe(401);
        expect(calls).toBe(0);
    });

    test("normalizes the same stable email contract as CMS Auth", async () => {
        expect(await subjectClaimHash("  Person@Internal ")).toBe(await subjectClaimHash("person@internal"));
    });

    test("uses an opaque Supabase secret as apikey without an invalid Bearer header", async () => {
        environment.delete("SUPABASE_SERVICE_ROLE_KEY");
        environment.set("SUPABASE_SECRET_KEYS", JSON.stringify({ default: "sb_secret_modern" }));
        let calls = 0;
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            calls += 1;
            expect(upstream.headers.get("apikey")).toBe("sb_secret_modern");
            expect(upstream.headers.get("authorization")).toBeNull();
            expect(new URL(upstream.url).pathname).toEndWith("/rpc/consent_requirements_projection");
            return Response.json({ enabled: false, contextKey: "signup", documents: [] });
        };

        const response = await handleConsentRequest(request("/requirements?context=signup"));

        expect(response.status).toBe(200);
        expect(calls).toBe(1);
    });

    test("accepts comma-separated Supabase keys and preserves legacy JWT Bearer auth", async () => {
        environment.delete("SUPABASE_SERVICE_ROLE_KEY");
        environment.set("SUPABASE_SECRET_KEYS", "legacy-service-role, sb_secret_secondary");
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            expect(upstream.headers.get("apikey")).toBe("legacy-service-role");
            expect(upstream.headers.get("authorization")).toBe("Bearer legacy-service-role");
            return Response.json({ enabled: false, contextKey: "signup", documents: [] });
        };

        const response = await handleConsentRequest(request("/requirements?context=signup"));

        expect(response.status).toBe(200);
    });

    test("materializes trusted resolver input during sync without fetching its snapshot URL", async () => {
        const page = publishedPage("Version initiale");
        const calls: Request[] = [];
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            calls.push(upstream);
            expect(new URL(upstream.url).pathname).toEndWith("/rpc/sync_consent_context");
            const body = await upstream.json();
            expect(body.p_documents[0]).toMatchObject({
                key: "terms",
                page,
                contentHash: await publishedPageContentHash(page),
            });
            return Response.json({ contextKey: "signup", enabled: true, documentCount: 1 });
        };

        const response = await handleConsentRequest(
            jsonRequest("/context/sync", {
                configuration: JSON.stringify({
                    enabled: true,
                    contextKey: "signup",
                    documents: [
                        {
                            enabled: true,
                            key: "terms",
                            label: "Conditions",
                            consentText: "J’accepte les Conditions",
                            page: {
                                ...page,
                                publishedSnapshotUrl: snapshotUrl("page-cgu"),
                            },
                        },
                    ],
                }),
            }),
        );

        expect(response.status).toBe(200);
        expect(calls).toHaveLength(1);
    });

    test("bootstraps an inactive context without replaying installation documents", async () => {
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            expect(new URL(upstream.url).pathname).toEndWith("/rpc/bootstrap_consent_context");
            expect(await upstream.json()).toEqual({
                p_context_key: "signup",
                p_actor_id: "cms-integration-bootstrap",
            });
            return Response.json(contextProjection({ enabled: true, revision: "17" }));
        };

        const response = await handleConsentRequest(jsonRequest("/context/bootstrap", { contextKey: "signup" }));

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ contextKey: "signup", enabled: true, revision: "17" });
    });

    test("publishes verified runtime documents with administrator identity and optimistic revision", async () => {
        const page = publishedPage("Runtime policy");
        const contentHash = await publishedPageContentHash(page);
        const paths: string[] = [];
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            const path = new URL(upstream.url).pathname;
            paths.push(path);
            if (path.endsWith("/.cms/content/published-page-snapshot")) {
                expect(upstream.redirect).toBe("error");
                return Response.json({ schema: "cms-published-page-snapshot-v1", page, contentHash });
            }
            expect(path).toEndWith("/rpc/publish_consent_context");
            expect(await upstream.json()).toMatchObject({
                p_context_key: "signup",
                p_enabled: true,
                p_expected_revision: "14",
                p_actor_id: "admin-42",
                p_snapshot_origin: "https://delivery.example",
                p_documents: [
                    {
                        key: "terms",
                        enabled: true,
                        label: "Conditions",
                        consentText: "I accept the Conditions",
                        pageId: "page-cgu",
                        publishedSnapshotUrl: snapshotUrl("page-cgu"),
                        page,
                        contentHash,
                    },
                ],
            });
            return Response.json(contextProjection({ enabled: true, revision: "15" }));
        };

        const response = await handleConsentRequest(
            adminJsonRequest("/admin/context/publish", {
                contextKey: "signup",
                enabled: true,
                expectedRevision: "14",
                documents: [
                    {
                        key: "terms",
                        enabled: true,
                        label: "Conditions",
                        consentText: "I accept the Conditions",
                        publishedSnapshotUrl: snapshotUrl("page-cgu"),
                    },
                ],
            }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ enabled: true, revision: "15" });
        expect(paths).toEqual(["/.cms/content/published-page-snapshot", "/rest/v1/rpc/publish_consent_context"]);
    });

    test("disables a runtime context without depending on CMS Delivery", async () => {
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            expect(new URL(upstream.url).pathname).toEndWith("/rpc/disable_consent_context");
            expect(await upstream.json()).toEqual({
                p_context_key: "signup",
                p_actor_id: "admin-42",
                p_expected_revision: "15",
            });
            return Response.json(contextProjection({ enabled: false, revision: "16" }));
        };

        const response = await handleConsentRequest(
            adminJsonRequest("/admin/context/publish", {
                contextKey: "signup",
                enabled: false,
                expectedRevision: "15",
                documents: [],
            }),
        );

        expect(response.status).toBe(200);
        expect(await response.json()).toMatchObject({ enabled: false, revision: "16" });
    });

    test("requires a CMS administrator identity before publishing", async () => {
        let calls = 0;
        globalThis.fetch = async () => {
            calls += 1;
            return Response.json({});
        };
        const response = await handleConsentRequest(
            jsonRequest("/admin/context/publish", {
                contextKey: "signup",
                enabled: true,
                expectedRevision: "11",
                documents: [],
            }),
        );

        expect(response.status).toBe(401);
        expect(calls).toBe(0);
    });

    test("surfaces a stale runtime policy revision as a conflict", async () => {
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            expect(new URL(upstream.url).pathname).toEndWith("/rpc/disable_consent_context");
            return Response.json({ message: "conflict: CONSENT_CONTEXT_REVISION_CHANGED" }, { status: 400 });
        };
        const response = await handleConsentRequest(
            adminJsonRequest("/admin/context/publish", {
                contextKey: "signup",
                enabled: false,
                expectedRevision: "12",
                documents: [],
            }),
        );

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "CONSENT_CONTEXT_REVISION_CHANGED" });
    });

    test("rejects consent copy that does not contain its linked label before storage", async () => {
        let calls = 0;
        globalThis.fetch = async () => {
            calls += 1;
            return Response.json({});
        };
        const page = publishedPage("Version initiale");
        const response = await handleConsentRequest(
            jsonRequest("/context/sync", {
                enabled: true,
                contextKey: "signup",
                documents: [
                    {
                        key: "terms",
                        label: "Conditions",
                        consentText: "J’accepte ce document",
                        page: { ...page, publishedSnapshotUrl: snapshotUrl("page-cgu") },
                    },
                ],
            }),
        );

        expect(response.status).toBe(422);
        expect(await response.json()).toEqual({
            error: "documents[0].consentText must contain label",
        });
        expect(calls).toBe(0);
    });

    test("reads repeated requirements from the materialized projection without snapshot fetches or writes", async () => {
        const paths: string[] = [];
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            const path = new URL(upstream.url).pathname;
            paths.push(path);
            expect(path).toEndWith("/rpc/consent_requirements_projection");
            return Response.json(requirements("f".repeat(64)));
        };

        const first = await handleConsentRequest(request("/requirements?context=signup"));
        const second = await handleConsentRequest(request("/requirements?context=signup"));

        expect(first.status).toBe(200);
        expect(second.status).toBe(200);
        expect(await first.json()).toEqual(requirements("f".repeat(64)));
        expect(paths).toEqual([
            "/rest/v1/rpc/consent_requirements_projection",
            "/rest/v1/rpc/consent_requirements_projection",
        ]);
    });

    test.each([
        { label: "scalar", accepted: "a".repeat(64), expected: ["a".repeat(64)] },
        { label: "array", accepted: ["a".repeat(64), "b".repeat(64)], expected: ["a".repeat(64), "b".repeat(64)] },
    ])(
        "normalizes a $label acceptance without downloading pages or forwarding credentials",
        async ({ accepted, expected }) => {
            let stageBody = "";
            const paths: string[] = [];
            globalThis.fetch = async (input, init) => {
                const upstream = new Request(input, init);
                const url = new URL(upstream.url);
                paths.push(url.pathname);
                if (url.pathname.endsWith("/rpc/stage_consent_acceptance")) {
                    stageBody = await upstream.text();
                    const body = JSON.parse(stageBody);
                    expect(body.p_accepted_version_ids).toEqual(expected);
                    expect(body.p_subject_claim_hash).toMatch(/^[a-f0-9]{64}$/);
                    expect(body).not.toHaveProperty("p_verified_documents");
                    return Response.json({ staged: true, attemptId: attempt, requiredCount: expected.length });
                }
                throw new Error(`Unexpected request ${url.pathname}`);
            };

            const response = await handleConsentRequest(
                jsonRequest("/acceptances/stage", {
                    contextKey: "signup",
                    subjectClaim: "Person@Example.test",
                    attemptId: attempt,
                    acceptedVersionIds: accepted,
                    password: "must-never-leave-the-handler",
                }),
            );

            expect(response.status).toBe(200);
            expect(stageBody).not.toContain("Person@Example.test");
            expect(stageBody).not.toContain("must-never-leave-the-handler");
            expect(paths).toEqual(["/rest/v1/rpc/stage_consent_acceptance"]);
        },
    );

    test("surfaces a materialized version conflict without downloading the published page", async () => {
        const paths: string[] = [];
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            const path = new URL(upstream.url).pathname;
            paths.push(path);
            if (path.endsWith("/rpc/stage_consent_acceptance")) {
                return Response.json({ state: "version_changed", staged: false, attemptId: attempt, requiredCount: 1 });
            }
            throw new Error(`Unexpected request ${path}`);
        };

        const response = await handleConsentRequest(
            jsonRequest("/acceptances/stage", {
                contextKey: "signup",
                subjectClaim: "person@example.test",
                attemptId: attempt,
                acceptedVersionIds: "a".repeat(64),
            }),
        );

        expect(response.status).toBe(409);
        expect(await response.json()).toEqual({ error: "CONSENT_DOCUMENT_VERSION_CHANGED" });
        expect(paths).toEqual(["/rest/v1/rpc/stage_consent_acceptance"]);
    });

    test.each([
        "http://169.254.169.254",
        "https://169.254.169.254",
        "https://127.0.0.1",
        "https://10.0.0.1",
        "https://localhost",
        "https://metadata.google.internal",
        "http://localhost",
    ])("rejects non-public snapshot origin %s during sync before storage", async (origin) => {
        let calls = 0;
        globalThis.fetch = async () => {
            calls += 1;
            return Response.json({});
        };

        const response = await handleConsentRequest(
            jsonRequest("/context/sync", syncBody(origin, publishedPage("Unsafe origin"))),
        );

        expect(response.status).toBe(422);
        expect(calls).toBe(0);
    });

    test.each(["//evil.example/legal", "/\\evil.example/legal", "/legal\u0000hidden"])(
        "rejects unsafe published page path %s during sync before storage",
        async (path) => {
            let calls = 0;
            const page = { ...publishedPage("Unsafe path"), path };
            globalThis.fetch = async () => {
                calls += 1;
                return Response.json({});
            };

            const response = await handleConsentRequest(
                jsonRequest("/context/sync", syncBody("https://delivery.example", page)),
            );

            expect(response.status).toBe(409);
            expect(calls).toBe(0);
        },
    );

    test("allows an HTTP localhost snapshot reference only when Supabase itself is local", async () => {
        environment.set("SUPABASE_URL", "http://127.0.0.1:54321");
        const page = publishedPage("Local development");
        const paths: string[] = [];
        globalThis.fetch = async (input, init) => {
            const upstream = new Request(input, init);
            const pathname = new URL(upstream.url).pathname;
            paths.push(pathname);
            expect(pathname).toEndWith("/rpc/sync_consent_context");
            return Response.json({ contextKey: "signup", enabled: true, documentCount: 1 });
        };

        const response = await handleConsentRequest(
            jsonRequest("/context/sync", syncBody("http://localhost:8787", page)),
        );

        expect(response.status).toBe(200);
        expect(paths).toEqual(["/rest/v1/rpc/sync_consent_context"]);
    });

    test("bounds a stalled PostgREST response body", async () => {
        globalThis.fetch = async (_input, init) => {
            const signal = init?.signal;
            const stream = new ReadableStream<Uint8Array>({
                start(controller) {
                    signal?.addEventListener(
                        "abort",
                        () => controller.error(new DOMException("aborted", "AbortError")),
                        {
                            once: true,
                        },
                    );
                },
            });
            return new Response(stream, { status: 200, headers: { "content-type": "application/json" } });
        };
        const startedAt = performance.now();

        const response = await handleConsentRequest(request("/requirements?context=signup"));

        expect(response.status).toBe(504);
        expect(performance.now() - startedAt).toBeLessThan(1_600);
    });
});

const attempt = "019fa294-cecb-7000-a735-ccd47ccb3739";

function request(path: string, headers: HeadersInit = { authorization: "Bearer cms-consent-test-key" }): Request {
    return new Request(`https://edge.test/cms-consent${path}`, { headers });
}

function jsonRequest(path: string, body: unknown): Request {
    return new Request(`https://edge.test/cms-consent${path}`, {
        method: "POST",
        headers: { authorization: "Bearer cms-consent-test-key", "content-type": "application/json" },
        body: JSON.stringify(body),
    });
}

function adminJsonRequest(path: string, body: unknown): Request {
    return new Request(`https://edge.test/cms-consent${path}`, {
        method: "POST",
        headers: {
            authorization: "Bearer cms-consent-test-key",
            "content-type": "application/json",
            "x-cms-user-id": "admin-42",
        },
        body: JSON.stringify(body),
    });
}

function contextProjection(overrides: { enabled: boolean; revision: string }) {
    return {
        contextKey: "signup",
        status: overrides.enabled ? "active" : "inactive",
        approvedSnapshotOrigin: overrides.enabled ? "https://delivery.example" : null,
        updatedAt: "2026-09-03T12:00:00Z",
        documents: [],
        ...overrides,
    };
}

function publishedPage(content: string, id = "page-cgu") {
    return { id, path: "/cgu", title: "Conditions", description: "Document", content };
}

function snapshotUrl(pageId: string): string {
    return `https://delivery.example/.cms/content/published-page-snapshot?id=${pageId}`;
}

function syncBody(origin: string, page: ReturnType<typeof publishedPage>) {
    return {
        enabled: true,
        contextKey: "signup",
        documents: [
            {
                enabled: true,
                key: "terms",
                label: "Conditions",
                consentText: "J’accepte les Conditions",
                page: {
                    ...page,
                    publishedSnapshotUrl: `${origin}/.cms/content/published-page-snapshot?id=${page.id}`,
                },
            },
        ],
    };
}

function requirements(versionId: string) {
    return {
        enabled: true,
        contextKey: "signup",
        documents: [
            {
                documentKey: "terms",
                versionId,
                label: "Conditions",
                consentText: "J’accepte les Conditions",
                consentPrefix: "J’accepte les ",
                consentSuffix: "",
                page: { id: "page-cgu", path: "/cgu", title: "Conditions" },
                contentHash: "e".repeat(64),
            },
        ],
    };
}
