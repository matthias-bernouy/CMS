import { describe, expect, test } from "bun:test";
import { column, constraint, evaluateMutation, evaluateSchemaPair, items, type SchemaMutation } from "./fixtures";

type ExpectedChange = readonly [classification: string, code: string];

describe("SQL schema compatibility calibration matrix", () => {
    test.each([
        [
            "nullable column addition",
            addColumn({ name: "note", type: "text", nullable: true }),
            ["additive", "column-added"],
        ],
        [
            "defaulted column addition",
            addColumn({ name: "rank", type: "integer", nullable: false, default: "0" }),
            ["additive", "column-added"],
        ],
        [
            "required column addition",
            addColumn({ name: "rank", type: "integer", nullable: false }),
            ["breaking", "required-column-added"],
        ],
        ["column removal", removeColumn("slug"), ["breaking", "column-removed"]],
        ["column rename", renameColumn("slug", "handle"), ["breaking", "column-removed"]],
        ["numeric widening", changeColumn("quantity", { type: "bigint" }), ["additive", "column-type-widened"]],
        ["numeric narrowing", changeColumn("quantity", { type: "smallint" }), ["breaking", "column-type-narrowed"]],
        ["unproven type change", changeColumn("quantity", { type: "text" }), ["unknown", "column-type-unproven"]],
        ["default addition", changeColumn("account_id", { default: "0" }), ["additive", "column-default-changed"]],
        ["default removal", changeColumn("quantity", { default: undefined }), ["breaking", "column-default-changed"]],
        ["default change", changeColumn("quantity", { default: "1" }), ["breaking", "column-default-changed"]],
        ["relation addition", addRelation(), ["additive", "relation-added"]],
        ["relation removal", removeRelation("accounts"), ["breaking", "relation-removed"]],
        ["relation rename", renameRelation("accounts", "customers"), ["breaking", "relation-removed"]],
        ["primary key removal", removeConstraint("items_pkey"), ["breaking", "constraint-removed"]],
        [
            "primary key change",
            changeConstraint("items_pkey", { columns: ["slug"] }),
            ["breaking", "constraint-changed"],
        ],
        ["unique addition", addUnique(), ["breaking", "constraint-added"]],
        ["unique removal", removeConstraint("items_slug_key"), ["breaking", "constraint-removed"]],
        [
            "unique change",
            changeConstraint("items_slug_key", { columns: ["slug", "account_id"] }),
            ["breaking", "constraint-changed"],
        ],
        ["foreign key addition", addForeignKey(), ["breaking", "constraint-added"]],
        ["foreign key removal", removeConstraint("items_account_fkey"), ["breaking", "constraint-removed"]],
        [
            "foreign key change",
            changeConstraint("items_account_fkey", { onDelete: "restrict" }),
            ["breaking", "constraint-changed"],
        ],
        ["check addition", addCheck(), ["breaking", "constraint-added"]],
        ["check removal", removeConstraint("items_quantity_check"), ["breaking", "constraint-removed"]],
        [
            "check expression change",
            changeConstraint("items_quantity_check", { expression: "(quantity > 0)" }),
            ["breaking", "constraint-changed"],
        ],
    ] satisfies readonly [string, SchemaMutation, ExpectedChange][])("%s", (_label, mutate, [classification, code]) => {
        expect(evaluateMutation(mutate).report.evidence).toContainEqual(
            expect.objectContaining({ classification, code }),
        );
    });

    test("classifies a primary key addition as breaking", () => {
        const decision = evaluateSchemaPair(removeConstraint("items_pkey"), addPrimaryKey());
        expect(decision.report.evidence).toContainEqual(
            expect.objectContaining({ classification: "breaking", code: "constraint-added" }),
        );
    });

    test("ignores declaration ordering but fails closed on generated-name renumbering", () => {
        const reordered = evaluateMutation((schema) => items(schema).constraints.reverse());
        expect(reordered.report.evidence).toEqual([]);

        const legacyAnonymousChecks: SchemaMutation = (schema) => {
            constraint(schema, "items_quantity_check").name = "items_check";
            items(schema).constraints.push({ kind: "check", name: "items_check1", expression: "(quantity < 1000)" });
        };
        const renumbered = evaluateSchemaPair(legacyAnonymousChecks, (schema) => {
            constraint(schema, "items_check").expression = "(quantity <> 500)";
            constraint(schema, "items_check1").expression = "(quantity >= 0)";
            items(schema).constraints.push({
                kind: "check",
                name: "items_check2",
                expression: "(quantity < 1000)",
            });
        });
        expect(renumbered.report.evidence).toContainEqual(
            expect.objectContaining({ classification: "breaking", code: "constraint-changed" }),
        );
        expect(renumbered.report.evidence).toContainEqual(
            expect.objectContaining({ classification: "breaking", code: "constraint-added" }),
        );
    });

    test.each([
        ["none to by-default identity", undefined, "by-default", "additive", "column-identity-changed"],
        ["by-default to always identity", "by-default", "always", "breaking", "column-identity-changed"],
        ["always to by-default identity", "always", "by-default", "additive", "column-identity-changed"],
        ["serial ownership removed", "auto", "none", "unknown", "column-sequence-ownership-changed"],
    ])("classifies %s", (_label, previous, next, classification, code) => {
        const setGeneration =
            (value: string | undefined): SchemaMutation =>
            (schema) => {
                const target = column(schema, "id");
                delete target.identity;
                delete target.sequenceDependency;
                delete target.default;
                if (value === "auto") {
                    target.default = "nextval('items_id_seq'::regclass)";
                    target.sequenceDependency = "auto";
                } else if (value && value !== "none") {
                    target.identity = value as "always" | "by-default";
                }
            };
        const decision = evaluateSchemaPair(setGeneration(previous), setGeneration(next));
        expect(decision.report.evidence).toContainEqual(expect.objectContaining({ classification, code }));
    });
});

function addColumn(value: Record<string, unknown>): SchemaMutation {
    return (schema) => items(schema).columns.push(value as never);
}

function removeColumn(name: string): SchemaMutation {
    return (schema) => {
        items(schema).columns = items(schema).columns.filter((entry) => entry.name !== name);
        items(schema).constraints = items(schema).constraints.filter(
            (entry) => entry.kind === "check" || !entry.columns.includes(name),
        );
    };
}

function renameColumn(previous: string, next: string): SchemaMutation {
    return (schema) => {
        column(schema, previous).name = next;
        for (const entry of items(schema).constraints) {
            if (entry.kind !== "check") {
                entry.columns = entry.columns.map((name) => (name === previous ? next : name));
            }
        }
    };
}

function changeColumn(name: string, changes: Record<string, unknown>): SchemaMutation {
    return (schema) => Object.assign(column(schema, name), changes);
}

function addRelation(): SchemaMutation {
    return (schema) =>
        items(schema) &&
        schema.namespaces[0]!.relations.push({
            kind: "table",
            name: "notes",
            columns: [{ name: "id", type: "bigint", nullable: false }],
            constraints: [],
        });
}

function removeRelation(name: string): SchemaMutation {
    return (schema) =>
        (schema.namespaces[0]!.relations = schema.namespaces[0]!.relations.filter((entry) => entry.name !== name));
}

function renameRelation(previous: string, next: string): SchemaMutation {
    return (schema) => {
        schema.namespaces[0]!.relations.find((entry) => entry.name === previous)!.name = next;
    };
}

function removeConstraint(name: string): SchemaMutation {
    return (schema) => (items(schema).constraints = items(schema).constraints.filter((entry) => entry.name !== name));
}

function changeConstraint(name: string, changes: Record<string, unknown>): SchemaMutation {
    return (schema) => Object.assign(constraint(schema, name), changes);
}

function addPrimaryKey(): SchemaMutation {
    return (schema) =>
        items(schema).constraints.push({ kind: "primary-key", name: "items_slug_pkey", columns: ["slug"] });
}

function addUnique(): SchemaMutation {
    return (schema) =>
        items(schema).constraints.push({ kind: "unique", name: "items_account_key", columns: ["account_id"] });
}

function addForeignKey(): SchemaMutation {
    return (schema) =>
        items(schema).constraints.push({
            kind: "foreign-key",
            name: "items_owner_fkey",
            columns: ["account_id"],
            references: { namespace: "app", relation: "accounts", columns: ["id"] },
            onUpdate: "no-action",
            onDelete: "restrict",
        });
}

function addCheck(): SchemaMutation {
    return (schema) =>
        items(schema).constraints.push({
            kind: "check",
            name: "items_quantity_max",
            expression: "(quantity < 1000)",
        });
}
