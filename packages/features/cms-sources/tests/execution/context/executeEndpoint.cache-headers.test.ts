import { describe, expect, mock, test } from "bun:test";
import { executeEndpoint, type ExecutorDeps, type SourceEndpoint } from "@bernouy/cms-sources";
import { ep } from "../../helpers/executeEndpointFixtures";

const publicFileEndpoint = (): SourceEndpoint =>
    ep({
        access: { mode: "public" },
        responseKind: "file",
        mediaType: "image/*",
        output: [{ status: "200" }],
    });

describe("executeEndpoint cache header projection", () => {
    test("drops any upstream cookie without disabling an eligible public connector cache", async () => {
        const fetchImpl = mock(
            async () =>
                new Response("image", {
                    headers: {
                        "Cache-Control": "public, max-age=31536000, immutable",
                        "Content-Type": "image/png",
                        "Set-Cookie": "provider-session=opaque; Path=/; HttpOnly",
                        Vary: "Accept-Encoding, Accept-Language",
                    },
                }),
        );

        const response = await executeEndpoint(publicFileEndpoint(), new Request("https://cms.test/source"), {
            fetchImpl,
            isTrustedConnectorTarget: () => true,
        });

        expect(response.headers.get("set-cookie")).toBeNull();
        expect(response.headers.get("cache-control")).toBe("public, max-age=31536000, immutable");
        expect(response.headers.get("vary")).toBe("Accept-Language");
    });

    test.each([
        {
            name: "untrusted target",
            endpoint: publicFileEndpoint(),
            deps: { isTrustedConnectorTarget: () => false },
        },
        {
            name: "authenticated endpoint",
            endpoint: { ...publicFileEndpoint(), access: { mode: "auth" as const } },
            deps: { isTrustedConnectorTarget: () => true },
        },
        {
            name: "computed identity header",
            endpoint: {
                ...publicFileEndpoint(),
                headers: [{ name: "X-User-ID", source: { from: "computed" as const, ref: "userID" as const } }],
            },
            deps: { isTrustedConnectorTarget: () => true, resolveContext: async () => ({ userID: "user-1" }) },
        },
        {
            name: "throwing trust matcher",
            endpoint: publicFileEndpoint(),
            deps: {
                isTrustedConnectorTarget: () => {
                    throw new Error("matcher unavailable");
                },
            },
        },
    ])("keeps a cookie-bearing $name response private", async ({ endpoint, deps }) => {
        const fetchImpl = mock(
            async () =>
                new Response("image", {
                    headers: {
                        "Cache-Control": "public, max-age=31536000, immutable",
                        "Content-Type": "image/png",
                        "Set-Cookie": "arbitrary=value",
                    },
                }),
        );

        const response = await executeEndpoint(endpoint, new Request("https://cms.test/source"), {
            ...deps,
            fetchImpl,
        } as ExecutorDeps);

        expect(response.headers.get("set-cookie")).toBeNull();
        expect(response.headers.get("cache-control")).toBe("private, no-store");
    });

    test("removes only the neutralized Accept-Encoding Vary dimension", async () => {
        const fetchImpl = mock(
            async () =>
                new Response("image", {
                    headers: { "Content-Type": "image/png", Vary: "Origin, Accept-Encoding, *" },
                }),
        );

        const response = await executeEndpoint(publicFileEndpoint(), new Request("https://cms.test/source"), {
            fetchImpl,
        });

        expect(response.headers.get("vary")).toBe("Origin, *");
    });
});
