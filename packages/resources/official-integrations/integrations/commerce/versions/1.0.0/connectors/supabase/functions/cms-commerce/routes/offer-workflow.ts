import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import { booleanValue, camelize, integer, readJsonObject, requiredText, text } from "../core/records.ts";
import { one, restJson, rpc } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";

export async function listOfferConditions(): Promise<Response> {
    const rows = await restJson<JsonRecord[]>(
        "offer_conditions?select=code,label,description,position,enabled,created_at,updated_at&order=position.asc,code.asc",
    );
    return json({ items: camelize(rows), total: rows.length });
}

export async function getOfferCondition(request: Request): Promise<Response> {
    const code = text(new URL(request.url).searchParams.get("code"));
    if (!code || code === "__new__") {
        return json({ code: "", label: "", description: "", position: 0, enabled: true });
    }
    const row = await one("offer_conditions", { code });
    if (!row) {
        throw new HttpError(404, "offer condition not found");
    }
    return json(camelize(row));
}

export async function upsertOfferCondition(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("upsert_offer_condition", {
        p_code: requiredText(body.code, "code"),
        p_label: requiredText(body.label, "label"),
        p_description: text(body.description) ?? null,
        p_position: integer(body.position, "position") ?? 0,
        p_enabled: booleanValue(body.enabled, "enabled") ?? true,
    });
    return json(camelize(result));
}

export async function listWorkflowStates(): Promise<Response> {
    const rows = await restJson<JsonRecord[]>(
        "offer_workflow_states?select=code,label,phase,position,enabled,terminal,created_at,updated_at&order=position.asc,code.asc",
    );
    return json({ items: camelize(rows), total: rows.length });
}

export async function getWorkflowState(request: Request): Promise<Response> {
    const code = text(new URL(request.url).searchParams.get("code"));
    if (!code || code === "__new__") {
        return json({ code: "", label: "", phase: "admin_review", position: 0, enabled: true, terminal: false });
    }
    const row = await one("offer_workflow_states", { code });
    if (!row) {
        throw new HttpError(404, "workflow state not found");
    }
    return json(camelize(row));
}

export async function upsertWorkflowState(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("upsert_workflow_state", {
        p_code: requiredText(body.code, "code"),
        p_label: requiredText(body.label, "label"),
        p_phase: requiredText(body.phase, "phase"),
        p_position: integer(body.position, "position") ?? 0,
        p_enabled: booleanValue(body.enabled, "enabled") ?? true,
        p_terminal: booleanValue(body.terminal, "terminal") ?? false,
    });
    return json(camelize(result));
}

export async function listWorkflowTransitions(): Promise<Response> {
    const rows = await restJson<JsonRecord[]>(
        "offer_workflow_transitions?select=from_state,action,actor_kind,to_state,created_at&order=from_state.asc,action.asc,actor_kind.asc",
    );
    const items = rows.map((row) => ({
        ...(camelize(row) as JsonRecord),
        id: `${String(row.from_state)}:${String(row.action)}:${String(row.actor_kind)}`,
    }));
    return json({ items, total: rows.length });
}

export async function getWorkflowTransition(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const identity = text(url.searchParams.get("id"))?.split(":");
    const fromState = text(url.searchParams.get("fromState")) ?? identity?.[0];
    const action = text(url.searchParams.get("action")) ?? identity?.[1];
    const actorKind = text(url.searchParams.get("actorKind")) ?? identity?.[2];
    if (!fromState || !action || !actorKind || action === "__new__") {
        return json({ fromState: "", action: "", actorKind: "admin", toState: "" });
    }
    const row = await one("offer_workflow_transitions", {
        from_state: fromState,
        action,
        actor_kind: actorKind,
    });
    if (!row) {
        throw new HttpError(404, "workflow transition not found");
    }
    return json(camelize(row));
}

export async function upsertWorkflowTransition(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const result = await rpc("upsert_workflow_transition", {
        p_from_state: requiredText(body.fromState, "fromState"),
        p_action: requiredText(body.action, "action"),
        p_actor_kind: requiredText(body.actorKind, "actorKind"),
        p_to_state: requiredText(body.toState, "toState"),
    });
    return json(camelize(result));
}
