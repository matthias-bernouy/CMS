import { describe, expect, test } from "bun:test";
import {
    applyPushIntegrations,
    fetchRemoteIntegrationDefinitions,
} from "cms-cli/push/integrations/apply";
import type { ClassifiedIntegration } from "cms-cli/push/integrations/classify";
import { orderIntegrationWritesByDependencies } from "cms-cli/push/integrations/order";
import type { LocalIntegrationImport } from "cms-cli/push/integrations/scan";
import { withFetch } from "./fixtures";
import type { IntegrationDefinition } from "@bernouy/cms-integrations";

type Dependency = NonNullable<NonNullable<LocalIntegrationImport["definition"]>["dependencies"]>[number];

describe("orderIntegrationWritesByDependencies", () => {
    test("orders transitive required dependencies before their dependants", () => {
        const ordered = orderIntegrationWritesByDependencies([
            integration("checkout", [{ name: "shop", kind: "commerce" }]),
            integration("commerce", [{ name: "foundation", kind: "basic-blocs" }], "update"),
            integration("basic-blocs"),
        ]);

        expect(ids(ordered)).toEqual(["basic-blocs", "commerce", "checkout"]);
    });

    test("preserves input order among integrations that are ready together", () => {
        const ordered = orderIntegrationWritesByDependencies([
            integration("z-root"),
            integration("payments", [
                { name: "shop", kind: "commerce" },
                { name: "provider", kind: "stripe-connect" },
            ]),
            integration("a-root"),
            integration("stripe-connect"),
            integration("commerce"),
        ]);

        expect(ids(ordered)).toEqual([
            "z-root",
            "a-root",
            "stripe-connect",
            "commerce",
            "payments",
        ]);

        expect(ids(orderIntegrationWritesByDependencies([
            integration("child", [{ name: "base", kind: "root" }]),
            integration("unrelated"),
            integration("root"),
            integration("later"),
        ]))).toEqual(["unrelated", "root", "child", "later"]);
    });

    test("prefers local optional dependencies but excludes unchanged entries", () => {
        const ordered = orderIntegrationWritesByDependencies([
            integration("optional-consumer", [{ name: "extra", kind: "optional-root", optional: true }]),
            integration("optional-root"),
            integration("unchanged", [], "unchanged"),
        ]);

        expect(ids(ordered)).toEqual(["optional-root", "optional-consumer"]);
    });

    test("drops a soft ordering edge when optional dependencies form a cycle", () => {
        const ordered = orderIntegrationWritesByDependencies([
            integration("a", [{ name: "b", kind: "b", optional: true }]),
            integration("b", [{ name: "a", kind: "a", optional: true }]),
        ]);

        expect(ids(ordered)).toEqual(["b", "a"]);
    });

    test("rejects a required dependency cycle with its path", () => {
        expect(() => orderIntegrationWritesByDependencies([
            integration("a", [{ name: "b", kind: "b" }]),
            integration("b", [{ name: "a", kind: "a" }]),
        ])).toThrow("Integration dependency cycle detected: a -> b -> a");
    });

    test("rejects duplicate writable integration kinds", () => {
        expect(() => orderIntegrationWritesByDependencies([
            integration("duplicate"),
            integration("duplicate", [], "update"),
        ])).toThrow('Duplicate writable integration kind "duplicate"');
    });

    test("does not create a cycle through an unchanged integration", () => {
        const ordered = orderIntegrationWritesByDependencies([
            integration("write", [{ name: "base", kind: "unchanged" }]),
            integration("unchanged", [{ name: "consumer", kind: "write" }], "unchanged"),
        ]);

        expect(ids(ordered)).toEqual(["write"]);
    });

    test("uses catalogue definitions to order kind-only imports", () => {
        const definitions = new Map([
            ["consumer", definition("consumer", [{ name: "base", kind: "root" }])],
            ["root", definition("root")],
        ]);

        const ordered = orderIntegrationWritesByDependencies([
            kindOnlyIntegration("consumer"),
            kindOnlyIntegration("root"),
        ], definitions);

        expect(ids(ordered)).toEqual(["root", "consumer"]);
    });

    test("keeps an inline definition authoritative over the catalogue", () => {
        const definitions = new Map([
            ["consumer", definition("consumer", [{ name: "base", kind: "root" }])],
            ["root", definition("root")],
        ]);

        const ordered = orderIntegrationWritesByDependencies([
            integration("consumer"),
            integration("root"),
        ], definitions);

        expect(ids(ordered)).toEqual(["consumer", "root"]);
    });
});

describe("applyPushIntegrations dependency failures", () => {
    test("does not POST dependants whose required integration failed", async () => {
        const calls: string[] = [];
        let result: Awaited<ReturnType<typeof applyPushIntegrations>> | undefined;

        await withFetch((_url, init) => {
            const request = JSON.parse(String(init?.body)) as LocalIntegrationImport;
            calls.push(request.kind);
            return request.kind === "root"
                ? new Response("invalid root", { status: 400 })
                : new Response(null, { status: 200 });
        }, async () => {
            result = await applyPushIntegrations(new URL("https://cms.example/"), "token", [
                integration("leaf", [{ name: "parent", kind: "dependant" }]),
                integration("dependant", [{ name: "root", kind: "root" }]),
                integration("root"),
                integration("independent"),
            ]);
        });

        expect(calls).toEqual(["root", "independent"]);
        expect(result?.pushed.map(item => item.id)).toEqual(["independent"]);
        expect(result?.failed.map(item => item.id)).toEqual(["root", "dependant", "leaf"]);
        expect(result?.failed[0]?.error).toContain("HTTP 400");
        expect(result?.failed[1]?.error).toBe('Skipped because dependency "root" failed to push');
        expect(result?.failed[2]?.error).toBe('Skipped because dependency "dependant" failed to push');
    });

    test("does not block a consumer when an optional dependency fails", async () => {
        const calls: string[] = [];
        let result: Awaited<ReturnType<typeof applyPushIntegrations>> | undefined;

        await withFetch((_url, init) => {
            const request = JSON.parse(String(init?.body)) as LocalIntegrationImport;
            calls.push(request.kind);
            return request.kind === "optional-root"
                ? new Response("invalid optional root", { status: 400 })
                : new Response(null, { status: 200 });
        }, async () => {
            result = await applyPushIntegrations(new URL("https://cms.example/"), "token", [
                integration("optional-root"),
                integration("consumer", [{ name: "extra", kind: "optional-root", optional: true }]),
            ]);
        });

        expect(calls).toEqual(["optional-root", "consumer"]);
        expect(result?.pushed.map(item => item.id)).toEqual(["consumer"]);
        expect(result?.failed.map(item => item.id)).toEqual(["optional-root"]);
    });

    test("propagates failures through catalogue definitions for kind-only imports", async () => {
        const calls: string[] = [];
        const definitions = new Map([
            ["consumer", definition("consumer", [{ name: "base", kind: "root" }])],
            ["root", definition("root")],
        ]);
        let result: Awaited<ReturnType<typeof applyPushIntegrations>> | undefined;

        await withFetch((_url, init) => {
            const request = JSON.parse(String(init?.body)) as LocalIntegrationImport;
            calls.push(request.kind);
            return new Response("invalid root", { status: 400 });
        }, async () => {
            result = await applyPushIntegrations(new URL("https://cms.example/"), "token", [
                kindOnlyIntegration("consumer"),
                kindOnlyIntegration("root"),
            ], definitions);
        });

        expect(calls).toEqual(["root"]);
        expect(result?.failed.map(item => item.id)).toEqual(["root", "consumer"]);
        expect(result?.failed[1]?.error).toBe('Skipped because dependency "root" failed to push');
    });
});

describe("fetchRemoteIntegrationDefinitions", () => {
    test("loads the remote catalogue used by kind-only imports", async () => {
        const definitions = [definition("root")];

        await withFetch((url, init) => {
            expect(url).toBe("https://cms.example/api/integrations/list");
            expect(init?.headers).toEqual({ "Authorization": "Bearer token" });
            return Response.json(definitions);
        }, async () => {
            expect(await fetchRemoteIntegrationDefinitions(
                new URL("https://cms.example/"),
                "token",
            )).toEqual(definitions);
        });
    });
});

function integration(
    kind: string,
    dependencies: Dependency[] = [],
    status: ClassifiedIntegration["status"] = "new",
): ClassifiedIntegration {
    return {
        integration: {
            id: kind,
            slug: kind,
            file: `integrations/${kind}.json`,
            request: {
                kind,
                answers: {},
                definition: {
                    kind,
                    label: kind,
                    inputs: [],
                    ...(dependencies.length > 0 ? { dependencies } : {}),
                },
            },
            hash: `hash-${kind}`,
        },
        status,
    };
}

function kindOnlyIntegration(
    kind: string,
    status: ClassifiedIntegration["status"] = "new",
): ClassifiedIntegration {
    const entry = integration(kind, [], status);
    entry.integration.request = { kind, answers: {} };
    return entry;
}

function definition(kind: string, dependencies: Dependency[] = []): IntegrationDefinition {
    return {
        kind,
        label: kind,
        inputs: [],
        ...(dependencies.length > 0 ? { dependencies } : {}),
    };
}

function ids(entries: ClassifiedIntegration[]): string[] {
    return entries.map(entry => entry.integration.id);
}
