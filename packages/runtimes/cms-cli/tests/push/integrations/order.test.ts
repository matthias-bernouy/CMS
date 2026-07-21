import { describe, expect, test } from "bun:test";
import { orderIntegrationWritesByDependencies } from "cms-cli/push/integrations/order";
import { definition, ids, integration, kindOnlyIntegration } from "./testData";

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

        expect(ids(ordered)).toEqual(["z-root", "a-root", "stripe-connect", "commerce", "payments"]);

        expect(
            ids(
                orderIntegrationWritesByDependencies([
                    integration("child", [{ name: "base", kind: "root" }]),
                    integration("unrelated"),
                    integration("root"),
                    integration("later"),
                ]),
            ),
        ).toEqual(["unrelated", "root", "child", "later"]);
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
        expect(() =>
            orderIntegrationWritesByDependencies([
                integration("a", [{ name: "b", kind: "b" }]),
                integration("b", [{ name: "a", kind: "a" }]),
            ]),
        ).toThrow("Integration dependency cycle detected: a -> b -> a");
    });

    test("rejects duplicate writable integration kinds", () => {
        expect(() =>
            orderIntegrationWritesByDependencies([integration("duplicate"), integration("duplicate", [], "update")]),
        ).toThrow('Duplicate writable integration kind "duplicate"');
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

        const ordered = orderIntegrationWritesByDependencies(
            [kindOnlyIntegration("consumer"), kindOnlyIntegration("root")],
            definitions,
        );

        expect(ids(ordered)).toEqual(["root", "consumer"]);
    });

    test("keeps an inline definition authoritative over the catalogue", () => {
        const definitions = new Map([
            ["consumer", definition("consumer", [{ name: "base", kind: "root" }])],
            ["root", definition("root")],
        ]);

        const ordered = orderIntegrationWritesByDependencies(
            [integration("consumer"), integration("root")],
            definitions,
        );

        expect(ids(ordered)).toEqual(["consumer", "root"]);
    });
});
