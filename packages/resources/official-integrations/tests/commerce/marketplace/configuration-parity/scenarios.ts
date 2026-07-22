import { fixturePairs } from "./fixtures";

export type Change = {
    row: Record<string, unknown>;
    dto: Record<string, unknown>;
    body: Record<string, unknown>;
    rpcBody: Record<string, unknown>;
};

export type ParityScenario = {
    name: string;
    actionId: string;
    route: string;
    detailQuery: string;
    rpc: string;
    table: string;
    detailParams: Record<string, string>;
    omittedKeys: readonly string[];
    missingError: string;
    changes: readonly Change[];
    invalid: { body: Record<string, unknown>; error: string };
};

export const coreParityScenarios: readonly ParityScenario[] = [
    {
        name: "offer condition",
        actionId: "saveCondition",
        route: "/admin/offer-condition",
        detailQuery: "code=refurbished",
        rpc: "upsert_offer_condition",
        table: "offer_conditions",
        detailParams: { select: "*", limit: "1", code: "eq.refurbished" },
        omittedKeys: ["id", "created_at", "updated_at"],
        missingError: "offer condition not found",
        changes: [
            {
                ...fixturePairs.condition[0],
                body: { code: "refurbished", label: "Refurbished", description: " ", position: 8, enabled: true },
                rpcBody: {
                    p_code: "refurbished",
                    p_label: "Refurbished",
                    p_description: null,
                    p_position: 8,
                    p_enabled: true,
                },
            },
            {
                ...fixturePairs.condition[1],
                body: {
                    code: "refurbished",
                    label: "Professionally refurbished",
                    description: "Inspected and restored",
                    position: 9,
                    enabled: false,
                },
                rpcBody: {
                    p_code: "refurbished",
                    p_label: "Professionally refurbished",
                    p_description: "Inspected and restored",
                    p_position: 9,
                    p_enabled: false,
                },
            },
        ],
        invalid: { body: { code: "", label: "Refurbished" }, error: "code is required" },
    },
    {
        name: "workflow state",
        actionId: "saveWorkflowState",
        route: "/admin/workflow-state",
        detailQuery: "code=quality_review",
        rpc: "upsert_workflow_state",
        table: "offer_workflow_states",
        detailParams: { select: "*", limit: "1", code: "eq.quality_review" },
        omittedKeys: ["id", "created_at", "updated_at"],
        missingError: "workflow state not found",
        changes: [
            {
                ...fixturePairs.state[0],
                body: {
                    code: "quality_review",
                    label: "Quality review",
                    phase: "admin_review",
                    position: 12,
                    enabled: true,
                    terminal: false,
                },
                rpcBody: {
                    p_code: "quality_review",
                    p_label: "Quality review",
                    p_phase: "admin_review",
                    p_position: 12,
                    p_enabled: true,
                    p_terminal: false,
                },
            },
            {
                ...fixturePairs.state[1],
                body: {
                    code: "quality_review",
                    label: "Review closed",
                    phase: "terminal",
                    position: 14,
                    enabled: false,
                    terminal: true,
                },
                rpcBody: {
                    p_code: "quality_review",
                    p_label: "Review closed",
                    p_phase: "terminal",
                    p_position: 14,
                    p_enabled: false,
                    p_terminal: true,
                },
            },
        ],
        invalid: { body: { code: "quality_review", label: "Quality review" }, error: "phase is required" },
    },
    {
        name: "workflow transition",
        actionId: "saveWorkflowTransition",
        route: "/admin/workflow-transition",
        detailQuery: "id=quality_review%3Acomplete_review%3Aadmin",
        rpc: "upsert_workflow_transition",
        table: "offer_workflow_transitions",
        detailParams: {
            select: "*",
            limit: "1",
            from_state: "eq.quality_review",
            action: "eq.complete_review",
            actor_kind: "eq.admin",
        },
        omittedKeys: ["id", "updatedAt", "created_at"],
        missingError: "workflow transition not found",
        changes: [
            {
                ...fixturePairs.transition[0],
                body: {
                    fromState: "quality_review",
                    action: "complete_review",
                    actorKind: "admin",
                    toState: "approved",
                },
                rpcBody: {
                    p_from_state: "quality_review",
                    p_action: "complete_review",
                    p_actor_kind: "admin",
                    p_to_state: "approved",
                },
            },
            {
                ...fixturePairs.transition[1],
                body: {
                    fromState: "quality_review",
                    action: "complete_review",
                    actorKind: "admin",
                    toState: "rejected",
                },
                rpcBody: {
                    p_from_state: "quality_review",
                    p_action: "complete_review",
                    p_actor_kind: "admin",
                    p_to_state: "rejected",
                },
            },
        ],
        invalid: {
            body: { fromState: "quality_review", action: "complete_review", actorKind: "admin" },
            error: "toState is required",
        },
    },
];
