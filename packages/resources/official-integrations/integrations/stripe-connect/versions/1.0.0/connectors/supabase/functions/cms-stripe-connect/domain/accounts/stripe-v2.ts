import { defaultCountry } from "../../shared/runtime.ts";
import { validBusinessType } from "../../http/body.ts";
import { HttpError } from "../../http/errors.ts";
import type { StripeAccount } from "../../provider/types.ts";
import { numberAt, objectAt, recordArrayAt, stringAt, unique } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";

export function isApplicationCollectedAccount(account: StripeAccount | null): boolean {
    if (!account || account.dashboard !== "none") {
        return false;
    }
    return (
        stringAt(objectAt(objectAt(account, "defaults"), "responsibilities"), "requirements_collector") ===
        "application"
    );
}

export function assertApplicationControlledRecipient(account: StripeAccount): void {
    if (!isApplicationCollectedAccount(account)) {
        throw new HttpError(
            502,
            "Stripe did not create an application-controlled recipient account without Dashboard access",
        );
    }
}

export function accountPatchFromStripeV2(account: StripeAccount): JsonRecord {
    const identity = objectAt(account, "identity");
    const recipient = objectAt(objectAt(account, "configuration"), "recipient");
    const capabilities = objectAt(recipient, "capabilities");
    const transferCapability = objectAt(objectAt(capabilities, "stripe_balance"), "stripe_transfers");
    const payoutCapability = objectAt(objectAt(capabilities, "stripe_balance"), "payouts");
    const transferStatus = stringAt(transferCapability, "status");
    const payoutStatus = stringAt(payoutCapability, "status");
    const statusDetails = recordArrayAt(transferCapability, "status_details");
    const requirementEntries = recordArrayAt(objectAt(account, "requirements"), "entries");
    const futureRequirements = objectAt(account, "future_requirements");
    const currentlyDue = requirementDescriptions(requirementEntries, "currently_due");
    const eventuallyDue = requirementDescriptions(requirementEntries, "eventually_due");
    const pastDue = requirementDescriptions(requirementEntries, "past_due");
    const pendingVerification = unique(
        requirementEntries
            .filter((entry) => stringAt(entry, "awaiting_action_from") === "stripe")
            .map(requirementDescription)
            .filter(Boolean),
    );
    const requirementErrors = requirementEntries.flatMap((entry) =>
        recordArrayAt(entry, "errors").map((error) => ({
            requirement: requirementDescription(entry),
            ...error,
        })),
    );
    const disabledReason = statusDetails.map((detail) => stringAt(detail, "code")).find(Boolean) ?? null;
    const detailsSubmitted = currentlyDue.length === 0 && pastDue.length === 0;

    return {
        stripe_account_id: account.id,
        application_controlled_recipient: isApplicationCollectedAccount(account),
        terms_accepted: stripeTermsAcceptedV2(account),
        provider_account_closed: account.closed === true,
        country: stringAt(identity, "country").toUpperCase() || defaultCountry(),
        business_type: validBusinessType(identity.entity_type) ? identity.entity_type : null,
        onboarding_status: accountStatusV2({
            account,
            transferStatus,
            disabledReason,
            currentlyDue,
            pastDue,
            pendingVerification,
        }),
        charges_enabled: false,
        payouts_enabled: payoutStatus === "active",
        details_submitted: detailsSubmitted,
        disabled_reason: disabledReason,
        capabilities,
        requirements_currently_due: currentlyDue,
        requirements_eventually_due: eventuallyDue,
        requirements_past_due: pastDue,
        requirements_pending_verification: pendingVerification,
        requirements_errors: requirementErrors,
        future_requirements: futureRequirements,
    };
}

function stripeTermsAcceptedV2(account: StripeAccount): boolean {
    const identity = objectAt(account, "identity");
    const attestations = objectAt(identity, "attestations");
    const terms = objectAt(attestations, "terms_of_service");
    const acceptance = objectAt(terms, "account");
    return (
        acceptance.shown_and_accepted === true || Boolean(numberAt(acceptance, "date") || stringAt(acceptance, "date"))
    );
}

function accountStatusV2(options: {
    account: StripeAccount;
    transferStatus: string;
    disabledReason: string | null;
    currentlyDue: string[];
    pastDue: string[];
    pendingVerification: string[];
}): string {
    if (options.account.closed === true || options.transferStatus === "unsupported") {
        return "rejected";
    }
    if (options.pastDue.length || options.currentlyDue.length) {
        return "requirements_due";
    }
    if (
        options.pendingVerification.length ||
        options.transferStatus === "pending" ||
        options.disabledReason === "requirements_pending_verification"
    ) {
        return "pending_verification";
    }
    if (options.transferStatus === "active") {
        return "enabled";
    }
    return "restricted";
}

function requirementDescriptions(entries: JsonRecord[], status: string): string[] {
    return unique(
        entries
            .filter((entry) => stringAt(objectAt(entry, "minimum_deadline"), "status") === status)
            .map(requirementDescription)
            .filter(Boolean),
    );
}

function requirementDescription(entry: JsonRecord): string {
    return stringAt(entry, "description") || stringAt(objectAt(entry, "reference"), "resource");
}
