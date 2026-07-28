export const namespaceRows = [{ namespace_name: "shop" }, { namespace_name: "audit" }];

export const relationRows = [
    { namespace_name: "shop", relation_name: "order_summary", relation_kind: "v" },
    { namespace_name: "shop", relation_name: "orders", relation_kind: "r" },
];

export const columnRows = [
    column({
        column_name: "serial_id",
        default_expression: "nextval('shop.orders_serial_id_seq'::regclass)",
        sequence_dependency_code: "a",
    }),
    column({ column_name: "id", identity_code: "d", sequence_dependency_code: "i" }),
    column({ column_name: "account_id" }),
    column({
        column_name: "search_text",
        default_expression: "((account_id)::text)",
        generated_code: "s",
    }),
    column({ column_name: "account_id", relation_name: "order_summary", nullable: true }),
];

export const constraintRows = [
    constraint({ constraint_name: "orders_pkey", constraint_type: "p", local_columns: ["id"] }),
    constraint({
        constraint_name: "orders_serial_id_key",
        constraint_type: "u",
        local_columns: ["serial_id"],
        nulls_not_distinct: true,
        deferrable: true,
        initially_deferred: true,
    }),
    constraint({
        constraint_name: "orders_account_fkey",
        constraint_type: "f",
        local_columns: ["account_id"],
        referenced_namespace_name: "accounts",
        referenced_relation_name: "users",
        referenced_columns: ["id"],
        update_action_code: "a",
        delete_action_code: "c",
        match_type_code: "s",
    }),
    constraint({
        constraint_name: "orders_account_positive",
        constraint_type: "c",
        check_expression: "(account_id > 0)",
    }),
];

export const catalogOutputs = [namespaceRows, relationRows, columnRows, constraintRows] as const;

export class FixtureCatalogClient implements SupabaseSchemaCatalogQueryClient {
    readonly calls: Array<{ statement: string; parameters: readonly unknown[] }> = [];
    private index = 0;

    constructor(private readonly outputs: readonly (readonly Record<string, unknown>[])[]) {}

    async query(statement: string, parameters: readonly unknown[]): Promise<readonly Record<string, unknown>[]> {
        this.calls.push({ statement, parameters });
        const output = this.outputs[this.index++];
        if (!output) {
            throw new Error("Unexpected catalog query");
        }
        return output;
    }
}

function column(overrides: Record<string, unknown>) {
    return {
        namespace_name: "shop",
        relation_name: "orders",
        column_name: "id",
        formatted_type: "int8",
        nullable: false,
        default_expression: null,
        identity_code: "",
        generated_code: "",
        sequence_dependency_code: null,
        ...overrides,
    };
}

function constraint(overrides: Record<string, unknown>) {
    return {
        namespace_name: "shop",
        relation_name: "orders",
        constraint_name: "constraint",
        constraint_type: "p",
        deferrable: false,
        initially_deferred: false,
        validated: true,
        local_columns: [],
        referenced_namespace_name: null,
        referenced_relation_name: null,
        referenced_columns: [],
        update_action_code: null,
        delete_action_code: null,
        match_type_code: null,
        nulls_not_distinct: null,
        check_expression: null,
        ...overrides,
    };
}
import type { SupabaseSchemaCatalogQueryClient } from "@bernouy/cms-integrations/supabase";
