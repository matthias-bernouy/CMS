import { describe, expect, test } from "bun:test";
import { readSupabaseObservedSchemaContract } from "@bernouy/cms-integrations/supabase";
import { catalogOutputs, FixtureCatalogClient } from "./catalogFixtures";

describe("Supabase PostgreSQL schema observation", () => {
    test("assembles owned catalog rows without copying referenced dependency relations", async () => {
        const client = new FixtureCatalogClient(catalogOutputs);
        const contract = await readSupabaseObservedSchemaContract({
            client,
            owner: { connectorKey: "primary", lineageId: "orders-supabase-v1" },
            ownedNamespaces: ["shop", "audit"],
        });

        expect(contract.namespaces.map((namespace) => namespace.name)).toEqual(["audit", "shop"]);
        const orders = contract.namespaces[1]!.relations.find((relation) => relation.name === "orders");
        expect(orders?.kind).toBe("table");
        expect(orders?.columns).toContainEqual(
            expect.objectContaining({
                name: "id",
                identity: "by-default",
                sequenceDependency: "internal",
                type: "bigint",
            }),
        );
        expect(orders?.columns).toContainEqual(
            expect.objectContaining({ name: "serial_id", sequenceDependency: "auto" }),
        );
        expect(orders?.columns).toContainEqual(
            expect.objectContaining({
                name: "search_text",
                default: "((account_id)::text)",
                generated: "stored",
            }),
        );
        expect(orders?.constraints).toContainEqual(
            expect.objectContaining({
                kind: "unique",
                name: "orders_serial_id_key",
                nullsNotDistinct: true,
                deferrable: true,
                initiallyDeferred: true,
            }),
        );
        expect(orders?.constraints).toContainEqual(
            expect.objectContaining({
                kind: "foreign-key",
                references: { namespace: "accounts", relation: "users", columns: ["id"] },
                onUpdate: "no-action",
                onDelete: "cascade",
                matchType: "simple",
            }),
        );
        expect(orders?.constraints).toContainEqual(
            expect.objectContaining({ kind: "check", expression: "(account_id > 0)" }),
        );
        expect(contract.namespaces.some((namespace) => namespace.name === "accounts")).toBeFalse();
    });

    test("uses bounded namespace parameters and the required PostgreSQL 16 catalogs", async () => {
        const client = new FixtureCatalogClient(catalogOutputs);
        await readSupabaseObservedSchemaContract({
            client,
            owner: { connectorKey: "primary", lineageId: "orders-supabase-v1" },
            ownedNamespaces: ["shop", "audit"],
        });

        expect(client.calls).toHaveLength(4);
        expect(client.calls.every((call) => JSON.stringify(call.parameters) === '[["audit","shop"]]')).toBeTrue();
        expect(client.calls[0]!.statement).toContain("pg_catalog.pg_namespace");
        expect(client.calls[1]!.statement).toContain("not relation.relispartition");
        expect(client.calls[2]!.statement).toContain("pg_catalog.pg_depend");
        expect(client.calls[2]!.statement).toContain("sequence_relation.relkind = 'S'");
        expect(client.calls[3]!.statement).toContain("pg_catalog.pg_index");
        expect(client.calls[3]!.statement).toContain("supporting_index.indnullsnotdistinct");
        expect(client.calls.every((call) => call.statement.includes("any($1::text[])"))).toBeTrue();
    });

    test("fails when an owned namespace is absent or duplicated", async () => {
        await expect(
            readSupabaseObservedSchemaContract({
                client: new FixtureCatalogClient([[{ namespace_name: "shop" }], [], [], []]),
                owner: { connectorKey: "primary", lineageId: "orders-supabase-v1" },
                ownedNamespaces: ["shop", "audit"],
            }),
        ).rejects.toThrow(/audit.*does not exist/);
        await expect(
            readSupabaseObservedSchemaContract({
                client: new FixtureCatalogClient(catalogOutputs),
                owner: { connectorKey: "primary", lineageId: "orders-supabase-v1" },
                ownedNamespaces: ["shop", "shop"],
            }),
        ).rejects.toThrow(/duplicated/);
    });
});
