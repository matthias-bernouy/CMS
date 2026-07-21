import { HttpError } from "../core/errors.ts";
import { json } from "../core/http.ts";
import { booleanValue, camelize, integer, readJsonObject, text } from "../core/records.ts";
import { one, restJson, rpc } from "../core/rest.ts";
import type { JsonRecord } from "../core/types.ts";
import { dynamicField, normalizeOptions, setBoolean, setText } from "./configuration-fields.ts";

const settingsSelect =
    "id,mode,default_currency,require_verified_seller,offer_moderation,price_policy,auto_approve_price_in_range,require_final_price_approval,seller_can_publish,active_c2c_fee_policy_id,active_c2c_protection_policy_id,active_c2c_seller_risk_policy_id,version,created_at,updated_at";
const customFieldSelect =
    "entity_type,key,label,field_type,options,unit,required,self_editable,admin_editable,public_readable,show_in_dashboard_table,position,enabled,created_at,updated_at";

export async function getSettings(): Promise<Response> {
    const row = await one("settings", { id: "default" }, settingsSelect);
    if (!row) {
        throw new HttpError(500, "commerce settings are missing");
    }
    return json(camelize(row));
}

export async function updateSettings(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const expectedVersion = integer(body.expectedVersion, "expectedVersion", true)!;
    const payload: JsonRecord = {};
    setText(payload, "mode", body.mode);
    setText(payload, "defaultCurrency", body.defaultCurrency, true);
    setText(payload, "offerModeration", body.offerModeration);
    setText(payload, "pricePolicy", body.pricePolicy);
    setBoolean(payload, "requireVerifiedSeller", body.requireVerifiedSeller);
    setBoolean(payload, "autoApprovePriceInRange", body.autoApprovePriceInRange);
    setBoolean(payload, "requireFinalPriceApproval", body.requireFinalPriceApproval);
    setBoolean(payload, "sellerCanPublish", body.sellerCanPublish);
    if (!Object.keys(payload).length) {
        throw new HttpError(400, "at least one setting is required");
    }

    const result = await rpc("update_settings", {
        p_payload: payload,
        p_expected_version: expectedVersion,
    });
    return json(camelize(result));
}

export async function listCustomFields(request: Request, entityOverride?: string): Promise<Response> {
    const url = new URL(request.url);
    const entityType = entityOverride ?? text(url.searchParams.get("entityType"));
    const params = new URLSearchParams({ select: customFieldSelect, order: "entity_type.asc,position.asc,key.asc" });
    if (entityType) {
        params.set("entity_type", `eq.${entityType}`);
    }
    if (entityOverride) {
        params.set("enabled", "eq.true");
    }
    const rows = await restJson<JsonRecord[]>(`custom_field_definitions?${params.toString()}`);
    const items = rows.map((row) => ({
        ...(camelize(row) as JsonRecord),
        id: `${String(row.entity_type)}:${String(row.key)}`,
    }));
    return json({ fields: rows.map(dynamicField), items, total: rows.length });
}

export async function listCustomFieldSchema(request: Request): Promise<Response> {
    const entityType = text(new URL(request.url).searchParams.get("entityType"));
    if (!entityType || !["product", "variant", "seller", "offer", "order"].includes(entityType)) {
        throw new HttpError(422, "supported entityType is required");
    }
    return listCustomFields(request, entityType);
}

export async function getCustomField(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const identity = text(url.searchParams.get("id"))?.split(":");
    const entityType = text(url.searchParams.get("entityType")) ?? identity?.[0];
    const key = text(url.searchParams.get("key")) ?? identity?.[1];
    if (!key || key === "__new__") {
        return json({
            entityType: entityType ?? "offer",
            key: "",
            label: "",
            fieldType: "string",
            options: [],
            unit: "",
            required: false,
            selfEditable: false,
            adminEditable: true,
            publicReadable: false,
            showInDashboardTable: false,
            position: 0,
            enabled: true,
        });
    }
    if (!entityType || !key) {
        throw new HttpError(400, "entityType and key are required");
    }
    const row = await one("custom_field_definitions", { entity_type: entityType, key }, customFieldSelect);
    if (!row) {
        throw new HttpError(404, "custom field not found");
    }
    return json(camelize(row));
}

export async function upsertCustomField(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const entityType = text(body.entityType);
    const key = text(body.key);
    const label = text(body.label);
    const fieldType = text(body.fieldType) ?? "string";
    if (!entityType || !key || !label) {
        throw new HttpError(400, "entityType, key, and label are required");
    }
    if (!["product", "variant", "seller", "offer", "order"].includes(entityType)) {
        throw new HttpError(422, "unsupported custom field entity type");
    }
    if (!["string", "number", "boolean", "enum"].includes(fieldType)) {
        throw new HttpError(422, "unsupported custom field type");
    }
    const options = normalizeOptions(body.options);
    if (fieldType === "enum" && !options.length) {
        throw new HttpError(422, "enum fields require options");
    }
    if (fieldType !== "enum" && options.length) {
        throw new HttpError(422, "only enum fields may define options");
    }
    const unit = fieldType === "number" ? text(body.unit) : undefined;
    if (unit && unit.length > 32) {
        throw new HttpError(422, "unit cannot exceed 32 characters");
    }
    const required = booleanValue(body.required, "required") ?? false;
    const selfEditable = booleanValue(body.selfEditable, "selfEditable") ?? false;
    const adminEditable = booleanValue(body.adminEditable, "adminEditable") ?? true;
    if (required && ["seller", "order"].includes(entityType) && !selfEditable) {
        throw new HttpError(422, "required self-created entity fields must be self editable");
    }
    if (required && entityType === "offer" && (!selfEditable || !adminEditable)) {
        throw new HttpError(422, "required offer fields must be editable by sellers and administrators");
    }
    if (required && ["product", "variant"].includes(entityType) && !adminEditable) {
        throw new HttpError(422, "required catalogue fields must be admin editable");
    }
    const result = await rpc("upsert_custom_field", {
        p_entity_type: entityType,
        p_key: key,
        p_label: label,
        p_field_type: fieldType,
        p_options: options,
        p_required: required,
        p_self_editable: selfEditable,
        p_admin_editable: adminEditable,
        p_public_readable: booleanValue(body.publicReadable, "publicReadable") ?? false,
        p_show_in_dashboard_table: booleanValue(body.showInDashboardTable, "showInDashboardTable") ?? false,
        p_position: integer(body.position, "position") ?? 0,
        p_enabled: booleanValue(body.enabled, "enabled") ?? true,
        p_unit: unit,
    });
    return json(camelize(result));
}

export async function deleteCustomField(request: Request): Promise<Response> {
    const url = new URL(request.url);
    const entityType = text(url.searchParams.get("entityType"));
    const key = text(url.searchParams.get("key"));
    if (!entityType || !key) {
        throw new HttpError(400, "entityType and key are required");
    }
    const result = await rpc("delete_custom_field", {
        p_entity_type: entityType,
        p_key: key,
    });
    return json(camelize(result));
}
