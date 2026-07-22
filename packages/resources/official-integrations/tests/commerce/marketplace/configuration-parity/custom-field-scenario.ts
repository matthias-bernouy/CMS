import { fixturePairs } from "./fixtures";
import type { Change, ParityScenario } from "./scenarios";

const customFieldSelect =
    "entity_type,key,label,field_type,options,unit,required,self_editable,admin_editable,public_readable,show_in_dashboard_table,position,enabled,created_at,updated_at";

export const customFieldScenario: ParityScenario = {
    name: "custom field",
    actionId: "saveCustomField",
    route: "/admin/custom-field",
    detailQuery: "id=product%3Aweight",
    rpc: "upsert_custom_field",
    table: "custom_field_definitions",
    detailParams: {
        select: customFieldSelect,
        limit: "1",
        entity_type: "eq.product",
        key: "eq.weight",
    },
    omittedKeys: ["id", "created_at", "updated_at"],
    missingError: "custom field not found",
    changes: [
        customFieldChange(fixturePairs.customField[0], "Weight", null, false, false, false, 3),
        customFieldChange(fixturePairs.customField[1], "Weight (kg)", "kg", true, true, true, 4),
    ],
    invalid: {
        body: { entityType: "product", key: "weight", fieldType: "number" },
        error: "entityType, key, and label are required",
    },
};

function customFieldChange(
    fixture: (typeof fixturePairs.customField)[number],
    label: string,
    unit: string | null,
    required: boolean,
    publicReadable: boolean,
    showInDashboardTable: boolean,
    position: number,
): Change {
    const body = {
        entityType: "product",
        key: "weight",
        label,
        fieldType: "number",
        options: [],
        unit: unit ?? "",
        required,
        selfEditable: false,
        adminEditable: true,
        publicReadable,
        showInDashboardTable,
        position,
        enabled: true,
    };
    return {
        ...fixture,
        body,
        rpcBody: {
            p_entity_type: "product",
            p_key: "weight",
            p_label: label,
            p_field_type: "number",
            p_options: [],
            p_required: required,
            p_self_editable: false,
            p_admin_editable: true,
            p_public_readable: publicReadable,
            p_show_in_dashboard_table: showInDashboardTable,
            p_position: position,
            p_enabled: true,
            ...(unit ? { p_unit: unit } : {}),
        },
    };
}
