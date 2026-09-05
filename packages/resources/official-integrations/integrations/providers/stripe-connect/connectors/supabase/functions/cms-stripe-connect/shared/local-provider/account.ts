import { isRecord } from "../data.ts";
import type { JsonRecord } from "../types.ts";

export function localAccount(id: string, input: JsonRecord): JsonRecord {
    const identity = isRecord(input.identity) ? input.identity : {};
    const defaults = isRecord(input.defaults) ? input.defaults : {};
    const responsibilities = isRecord(defaults.responsibilities) ? defaults.responsibilities : {};
    return {
        id,
        dashboard: "none",
        closed: false,
        identity: {
            ...identity,
            country: typeof identity.country === "string" ? identity.country : "fr",
            entity_type: "individual",
            attestations: { terms_of_service: { account: { shown_and_accepted: true, date: 1_788_000_000 } } },
        },
        defaults: { ...defaults, responsibilities: { ...responsibilities, requirements_collector: "application" } },
        configuration: {
            recipient: {
                capabilities: {
                    stripe_balance: {
                        stripe_transfers: { status: "active", status_details: [] },
                        payouts: { status: "active", status_details: [] },
                    },
                },
            },
        },
        requirements: { entries: [] },
        future_requirements: { entries: [] },
    };
}
