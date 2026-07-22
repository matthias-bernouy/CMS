import { defaultCountry } from "../../config/runtime.ts";
import { validBusinessType } from "../../http/body.ts";
import type { StripeAccount } from "../../provider/types.ts";
import { arrayAt, isRecord, numberAt, objectAt, stringArrayAt, stringAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export function accountPatchFromStripeV1(account: StripeAccount): JsonRecord {
    const requirements = objectAt(account, "requirements");
    const futureRequirements = objectAt(account, "future_requirements");
    return {
        stripe_account_id: account.id,
        application_controlled_recipient: false,
        terms_accepted: stripeTermsAcceptedV1(account),
        provider_account_closed: false,
        country:
            typeof account.country === "string" && account.country ? account.country.toUpperCase() : defaultCountry(),
        business_type: validBusinessType(account.business_type) ? account.business_type : null,
        onboarding_status: accountStatusV1(account),
        charges_enabled: Boolean(account.charges_enabled),
        payouts_enabled: Boolean(account.payouts_enabled),
        details_submitted: Boolean(account.details_submitted),
        disabled_reason: stringAt(requirements, "disabled_reason") || null,
        capabilities: isRecord(account.capabilities) ? account.capabilities : {},
        requirements_currently_due: stringArrayAt(requirements, "currently_due"),
        requirements_eventually_due: stringArrayAt(requirements, "eventually_due"),
        requirements_past_due: stringArrayAt(requirements, "past_due"),
        requirements_pending_verification: stringArrayAt(requirements, "pending_verification"),
        requirements_errors: arrayAt(requirements, "errors"),
        future_requirements: isRecord(futureRequirements) ? futureRequirements : {},
    };
}

function accountStatusV1(account: StripeAccount): string {
    const requirements = objectAt(account, "requirements");
    const disabledReason = stringAt(requirements, "disabled_reason");
    if (disabledReason?.includes("rejected")) {
        return "rejected";
    }
    if (stringArrayAt(requirements, "past_due").length || stringArrayAt(requirements, "currently_due").length) {
        return "requirements_due";
    }
    if (stringArrayAt(requirements, "pending_verification").length) {
        return "pending_verification";
    }
    if (disabledReason) {
        return "restricted";
    }
    if (account.payouts_enabled) {
        return "enabled";
    }
    if (account.details_submitted) {
        return "pending_verification";
    }
    return account.id ? "restricted" : "not_started";
}

function stripeTermsAcceptedV1(account: StripeAccount): boolean {
    const acceptance = objectAt(account, "tos_acceptance");
    return Boolean(numberAt(acceptance, "date") || stringAt(acceptance, "date"));
}
