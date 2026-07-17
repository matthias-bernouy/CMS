import { jsonResponse, setRestResponder } from "../../../harness";
import {
    componentRows,
    feePolicyRow,
    protectionPolicyRow,
    sellerRiskPolicyRow,
    settingsRow,
    subsidyRows,
} from "./raw";

type Row = Record<string, unknown>;
type Options = {
    settings?: Row | null;
    feePolicy?: Row | null;
    protectionPolicy?: Row | null;
    sellerRiskPolicy?: Row | null;
    components?: Row[];
    subsidies?: Row[];
    failure?: { resource: string; message: string; status?: number };
};

export function useC2cPolicyResponder(options: Options = {}): void {
    const rows = resolvedRows(options);
    setRestResponder(request => {
        const resource = new URL(request.url).pathname.split("/").at(-1)!;
        if (resource === "get_c2c_policy_configuration_read_model") {
            if (options.failure) {
                return jsonResponse({ message: options.failure.message }, options.failure.status ?? 503);
            }
            return jsonResponse(c2cReadModelEnvelope(options));
        }
        if (options.failure?.resource === resource) {
            return jsonResponse({ message: options.failure.message }, options.failure.status ?? 503);
        }
        if (resource === "settings") return jsonResponse(rows.settings ? [rows.settings] : []);
        if (resource === "fee_policies") return jsonResponse(rows.feePolicy ? [rows.feePolicy] : []);
        if (resource === "protection_policies") {
            return jsonResponse(rows.protectionPolicy ? [rows.protectionPolicy] : []);
        }
        if (resource === "seller_risk_policies") {
            return jsonResponse(rows.sellerRiskPolicy ? [rows.sellerRiskPolicy] : []);
        }
        if (resource === "fee_policy_components") return jsonResponse(rows.components);
        if (resource === "financial_subsidy_overrides") return jsonResponse(rows.subsidies);
        throw new Error(`unexpected C2C policy request ${request.url}`);
    });
}

export function c2cReadModelEnvelope(options: Options = {}): Row {
    const rows = resolvedRows(options);
    if (!rows.settings) return { state: "settings_missing" };
    return {
        state: "ok",
        settings: { ...rows.settings, future_private_setting: true },
        fee_policy: rows.feePolicy && { ...rows.feePolicy, future_private_fee: true },
        protection_policy: rows.protectionPolicy && {
            ...rows.protectionPolicy, future_private_protection: true,
        },
        seller_risk_policy: rows.sellerRiskPolicy && {
            ...rows.sellerRiskPolicy, future_private_risk: true,
        },
        components: rows.components.map(row => ({ ...row, future_private_component: true })),
        subsidy_overrides: rows.subsidies.map(row => ({
            ...row, future_private_subsidy: true,
        })),
    };
}

function resolvedRows(options: Options) {
    return {
        settings: options.settings === undefined ? settingsRow : options.settings,
        feePolicy: options.feePolicy === undefined ? feePolicyRow : options.feePolicy,
        protectionPolicy: options.protectionPolicy === undefined
            ? protectionPolicyRow
            : options.protectionPolicy,
        sellerRiskPolicy: options.sellerRiskPolicy === undefined
            ? sellerRiskPolicyRow
            : options.sellerRiskPolicy,
        components: options.components ?? componentRows,
        subsidies: options.subsidies ?? subsidyRows,
    };
}
