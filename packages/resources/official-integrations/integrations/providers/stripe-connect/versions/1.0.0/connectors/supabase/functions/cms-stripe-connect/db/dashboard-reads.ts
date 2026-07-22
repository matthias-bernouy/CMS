import { queryLimit, searchPattern } from "../http/query.ts";
import type { JsonRecord } from "../shared/types.ts";
import { callRpcRows } from "./postgrest.ts";

export type DashboardAdminActor = {
    userId: string;
    actorKind: "admin";
};

export type RefundDashboardRead = {
    refund: JsonRecord;
    client_reference_id: string;
};

export type DisputeDashboardRead = {
    dispute: JsonRecord;
    client_reference_id: string;
    staged_evidence: JsonRecord | null;
    evidence_submission_count: number;
    pending_approval: JsonRecord | null;
};

export type FinancialOperationDashboardRead = {
    operation: JsonRecord;
    client_reference_id: string | null;
    payment_currency: string | null;
};

export async function readRefundDashboardPage(
    request: Request,
    actor: DashboardAdminActor,
): Promise<RefundDashboardRead[]> {
    return await callRpcRows<RefundDashboardRead>("list_dashboard_refunds", {
        ...actorParams(actor),
        ...pageParams(request),
    });
}

export async function readDisputeDashboardPage(
    request: Request,
    actor: DashboardAdminActor,
): Promise<DisputeDashboardRead[]> {
    return await callRpcRows<DisputeDashboardRead>("read_dashboard_disputes", {
        ...actorParams(actor),
        ...pageParams(request),
        p_dispute_id: null,
    });
}

export async function readDisputeDashboardDetail(
    disputeId: string,
    actor: DashboardAdminActor,
): Promise<DisputeDashboardRead | null> {
    const rows = await callRpcRows<DisputeDashboardRead>("read_dashboard_disputes", {
        ...actorParams(actor),
        p_limit: 1,
        p_search: null,
        p_status: null,
        p_dispute_id: disputeId,
    });
    return rows[0] ?? null;
}

export async function readFinancialOperationDashboardPage(
    request: Request,
    actor: DashboardAdminActor,
): Promise<FinancialOperationDashboardRead[]> {
    return await callRpcRows<FinancialOperationDashboardRead>("list_dashboard_financial_operations", {
        ...actorParams(actor),
        ...pageParams(request),
    });
}

function pageParams(request: Request): {
    p_limit: number;
    p_search: string | null;
    p_status: string | null;
} {
    const params = new URL(request.url).searchParams;
    return {
        p_limit: queryLimit(params.get("limit")),
        p_search: searchPattern(params.get("q")),
        p_status: params.get("status")?.trim() || null,
    };
}

function actorParams(actor: DashboardAdminActor): {
    p_actor_id: string;
    p_actor_kind: "admin";
} {
    return { p_actor_id: actor.userId, p_actor_kind: actor.actorKind };
}
