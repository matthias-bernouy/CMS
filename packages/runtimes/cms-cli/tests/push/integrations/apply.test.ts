import { describe, expect, test } from "bun:test";
import { applyPushIntegrations, fetchRemoteIntegrationDefinitions } from "cms-cli/push/integrations/apply";
import type { LocalIntegrationImport } from "cms-cli/push/integrations/scan";
import { withFetch } from "./fixtures";
import { definition, integration, kindOnlyIntegration } from "./testData";

describe("applyPushIntegrations dependency failures", () => {
    test("does not POST dependants whose required integration failed", async () => {
        const calls: string[] = [];
        let result: Awaited<ReturnType<typeof applyPushIntegrations>> | undefined;

        await withFetch(
            (_url, init) => {
                const request = JSON.parse(String(init?.body)) as LocalIntegrationImport;
                calls.push(request.kind);
                return request.kind === "root"
                    ? new Response("invalid root", { status: 400 })
                    : new Response(null, { status: 200 });
            },
            async () => {
                result = await applyPushIntegrations(new URL("https://cms.example/"), "token", [
                    integration("leaf", [{ name: "parent", kind: "dependant" }]),
                    integration("dependant", [{ name: "root", kind: "root" }]),
                    integration("root"),
                    integration("independent"),
                ]);
            },
        );

        expect(calls).toEqual(["root", "independent"]);
        expect(result?.pushed.map((item) => item.id)).toEqual(["independent"]);
        expect(result?.failed.map((item) => item.id)).toEqual(["root", "dependant", "leaf"]);
        expect(result?.failed[0]?.error).toContain("HTTP 400");
        expect(result?.failed[1]?.error).toBe('Skipped because dependency "root" failed to push');
        expect(result?.failed[2]?.error).toBe('Skipped because dependency "dependant" failed to push');
    });

    test("does not block a consumer when an optional dependency fails", async () => {
        const calls: string[] = [];
        let result: Awaited<ReturnType<typeof applyPushIntegrations>> | undefined;

        await withFetch(
            (_url, init) => {
                const request = JSON.parse(String(init?.body)) as LocalIntegrationImport;
                calls.push(request.kind);
                return request.kind === "optional-root"
                    ? new Response("invalid optional root", { status: 400 })
                    : new Response(null, { status: 200 });
            },
            async () => {
                result = await applyPushIntegrations(new URL("https://cms.example/"), "token", [
                    integration("optional-root"),
                    integration("consumer", [{ name: "extra", kind: "optional-root", optional: true }]),
                ]);
            },
        );

        expect(calls).toEqual(["optional-root", "consumer"]);
        expect(result?.pushed.map((item) => item.id)).toEqual(["consumer"]);
        expect(result?.failed.map((item) => item.id)).toEqual(["optional-root"]);
    });

    test("propagates failures through catalogue definitions for kind-only imports", async () => {
        const calls: string[] = [];
        const definitions = new Map([
            ["consumer", definition("consumer", [{ name: "base", kind: "root" }])],
            ["root", definition("root")],
        ]);
        let result: Awaited<ReturnType<typeof applyPushIntegrations>> | undefined;

        await withFetch(
            (_url, init) => {
                const request = JSON.parse(String(init?.body)) as LocalIntegrationImport;
                calls.push(request.kind);
                return new Response("invalid root", { status: 400 });
            },
            async () => {
                result = await applyPushIntegrations(
                    new URL("https://cms.example/"),
                    "token",
                    [kindOnlyIntegration("consumer"), kindOnlyIntegration("root")],
                    definitions,
                );
            },
        );

        expect(calls).toEqual(["root"]);
        expect(result?.failed.map((item) => item.id)).toEqual(["root", "consumer"]);
        expect(result?.failed[1]?.error).toBe('Skipped because dependency "root" failed to push');
    });
});

describe("fetchRemoteIntegrationDefinitions", () => {
    test("loads the remote catalogue used by kind-only imports", async () => {
        const definitions = [definition("root")];

        await withFetch(
            (url, init) => {
                expect(url).toBe("https://cms.example/api/integrations/list");
                expect(init?.headers).toEqual({ "Authorization": "Bearer token" });
                return Response.json(definitions);
            },
            async () => {
                expect(await fetchRemoteIntegrationDefinitions(new URL("https://cms.example/"), "token")).toEqual(
                    definitions,
                );
            },
        );
    });
});

describe("applyPushIntegrations version pinning", () => {
    test("sends the exact requested version when rerunning an installation", async () => {
        const entry = kindOnlyIntegration("commerce", "update");
        entry.integration.request.version = "1.2.3";
        let body: Record<string, unknown> | undefined;

        await withFetch(
            (url, init) => {
                expect(url).toBe("https://cms.example/api/integrations/installations/rerun?id=commerce");
                body = JSON.parse(String(init?.body)) as Record<string, unknown>;
                return new Response(null, { status: 200 });
            },
            async () => {
                const result = await applyPushIntegrations(new URL("https://cms.example/"), "token", [entry]);
                expect(result.failed).toEqual([]);
            },
        );

        expect(body).toEqual({ version: "1.2.3", answers: {}, options: { force: true } });
    });
});
