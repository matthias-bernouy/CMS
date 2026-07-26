import { describe, expect, test } from "bun:test";
import { projectObservedSchemaContract } from "@bernouy/cms-integrations";
import { observedSchemaFixture } from "./fixtures";

describe("observed connector schema compatibility projection", () => {
    test("preserves relation, generation, sequence, and constraint semantics", () => {
        const projected = projectObservedSchemaContract(observedSchemaFixture());
        const orders = projected.namespaces.find((namespace) => namespace.name === "shop")?.relations[0];

        expect(orders).toMatchObject({ name: "orders", kind: "table" });
        expect(orders?.columns).toContainEqual({
            name: "id",
            type: "bigint",
            nullable: false,
            identity: "by-default",
            sequenceDependency: "internal",
        });
        expect(orders?.columns).toContainEqual({
            name: "serial_id",
            type: "bigint",
            nullable: false,
            default: "nextval('shop.orders_serial_id_seq'::regclass)",
            sequenceDependency: "auto",
        });
        expect(orders?.constraints).toContainEqual(
            expect.objectContaining({
                kind: "unique",
                name: "orders_serial_id_key",
                nullsNotDistinct: true,
                deferrable: true,
                initiallyDeferred: true,
            }),
        );
    });
});
