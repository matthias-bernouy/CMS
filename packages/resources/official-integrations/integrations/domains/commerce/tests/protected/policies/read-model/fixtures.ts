import { jsonResponse, setRestResponder } from "../../../harness";
import { componentRows, feePolicyRow, protectionPolicyRow, sellerRiskPolicyRow, settingsRow, subsidyRows } from "./raw";

type Row = Record<string, unknown>;
const functionName = "get_c2c_policy_configuration_read_model";
type Options = {
    settings?: Row | null;
    feePolicy?: Row | null;
    protectionPolicy?: Row | null;
    sellerRiskPolicy?: Row | null;
    components?: Row[];
    subsidies?: Row[];
    failure?: { message: string; status?: number };
};

export function useC2cPolicyResponder(options: Options = {}): void {
    setRestResponder((request) => {
        const resource = new URL(request.url).pathname.split("/").at(-1)!;
        if (resource !== functionName) {
            throw new Error(`unexpected C2C policy request ${request.url}`);
        }
        if (options.failure) {
            return jsonResponse({ message: options.failure.message }, options.failure.status ?? 503);
        }
        return jsonResponse(c2cReadModelEnvelope(options));
    });
}

export function c2cReadModelEnvelope(options: Options = {}): Row {
    const rows = resolvedRows(options);
    if (!rows.settings) {
        return { state: "settings_missing" };
    }
    return {
        state: "ok",
        settings: { ...rows.settings, future_private_setting: true },
        fee_policy: rows.feePolicy && { ...rows.feePolicy, future_private_fee: true },
        protection_policy: rows.protectionPolicy && {
            ...rows.protectionPolicy,
            future_private_protection: true,
        },
        seller_risk_policy: rows.sellerRiskPolicy && {
            ...rows.sellerRiskPolicy,
            future_private_risk: true,
        },
        components: rows.components.map((row) => ({ ...row, future_private_component: true })),
        subsidy_overrides: rows.subsidies.map((row) => ({
            ...row,
            future_private_subsidy: true,
        })),
    };
}

function resolvedRows(options: Options) {
    return {
        settings: options.settings === undefined ? settingsRow : options.settings,
        feePolicy: options.feePolicy === undefined ? feePolicyRow : options.feePolicy,
        protectionPolicy: options.protectionPolicy === undefined ? protectionPolicyRow : options.protectionPolicy,
        sellerRiskPolicy: options.sellerRiskPolicy === undefined ? sellerRiskPolicyRow : options.sellerRiskPolicy,
        components: options.components ?? componentRows,
        subsidies: options.subsidies ?? subsidyRows,
    };
}
