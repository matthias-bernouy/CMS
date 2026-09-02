import { getRowByField, updateRow, upsertRow } from "../../db/postgrest.ts";
import { getAccountRowByStripeAccountId, updateAccountRow } from "../../db/repositories/accounts.ts";
import { resolveProviderException, upsertProviderException } from "../../db/repositories/events-exceptions.ts";
import { updatePayment } from "../../db/repositories/payments.ts";
import type { PlatformPayoutControlRow } from "../../db/records/operations.ts";
import { transferSelect, type TransferRow } from "../../db/records/transfers.ts";
import { accountPatchFromStripe } from "../../domain/accounts/provider-projection.ts";
import { retrievePlatformBalanceSettings } from "../../provider/accounts/balances.ts";
import { retrieveAccount } from "../../provider/accounts/lifecycle.ts";
import { retrieveStripePayout } from "../../provider/payouts.ts";
import { errorMessage, numberAt, objectAt, stringAt } from "../../shared/data.ts";
import { protectedPlatformPayoutInterval } from "../../shared/runtime.ts";
import type { JsonRecord } from "../../shared/types.ts";

export async function processStripeV2AccountEvent(objectId: string): Promise<boolean> {
    if (!objectId) {
        throw new Error("Stripe Accounts v2 event has no related account id");
    }
    const account = await getAccountRowByStripeAccountId(objectId);
    if (!account) {
        return false;
    }
    if (account.stripe_account_api_version !== "v2") {
        throw new Error("Stripe Accounts v2 event targets a non-v2 local account");
    }
    const provider = await retrieveAccount(objectId, "v2");
    await updateAccountRow(account.cms_user_id, {
        ...accountPatchFromStripe(provider, "v2"),
        last_provider_sync_at: new Date().toISOString(),
    });
    return true;
}

export async function processStripeAccountUpdatedEvent(objectId: string): Promise<boolean> {
    if (!objectId) {
        return false;
    }
    const account = await getAccountRowByStripeAccountId(objectId);
    if (!account) {
        return false;
    }
    const provider = await retrieveAccount(objectId, account.stripe_account_api_version);
    await updateAccountRow(account.cms_user_id, {
        ...accountPatchFromStripe(provider, account.stripe_account_api_version),
        last_provider_sync_at: new Date().toISOString(),
    });
    return true;
}

export async function processStripeTransferEvent(
    object: JsonRecord,
    objectId: string,
    eventId: string,
): Promise<boolean> {
    if (!objectId) {
        return false;
    }
    const transfer = await getRowByField<TransferRow>("transfers", "stripe_transfer_id", objectId, transferSelect);
    if (!transfer) {
        return false;
    }
    const amountReversed = Number(object.amount_reversed ?? 0);
    await updateRow("transfers", transfer.id, {
        status: object.reversed === true ? "reversed" : amountReversed > 0 ? "partially_reversed" : "succeeded",
        provider_snapshot: object,
    });
    await updatePayment(transfer.payment_id, { last_stripe_event_id: eventId });
    return true;
}

export async function processStripePayoutEvent(
    event: JsonRecord,
    eventType: string,
    object: JsonRecord,
    objectId: string,
): Promise<boolean> {
    const stripeAccountId = stringAt(event, "account") || "platform";
    if (!objectId) {
        return false;
    }
    const account = stripeAccountId === "platform" ? null : await getAccountRowByStripeAccountId(stripeAccountId);
    let providerSnapshot = object;
    let payoutTruthError: string | null = null;
    if (typeof providerSnapshot.automatic !== "boolean" && stringAt(providerSnapshot, "method") !== "instant") {
        try {
            providerSnapshot = await retrieveStripePayout(objectId, stripeAccountId);
        } catch (error) {
            payoutTruthError = errorMessage(error);
        }
    }
    const manualPayout = providerSnapshot.automatic === false;
    const instantPayout = stringAt(providerSnapshot, "method") === "instant";
    const ambiguousPayout = !manualPayout && !instantPayout && providerSnapshot.automatic !== true;
    const failedPayout = eventType === "payout.failed" || stringAt(providerSnapshot, "status") === "failed";
    const connectedEmergencyHold = Boolean(
        account &&
            (account.manual_payout_hold_started_at ||
                account.outstanding_debt_amount > 0 ||
                account.financial_exposure_amount > 0),
    );
    let platformControlDrift = false;
    if (!account && !manualPayout && !instantPayout && !ambiguousPayout) {
        try {
            const [settings, control] = await Promise.all([
                retrievePlatformBalanceSettings(),
                getRowByField<PlatformPayoutControlRow>("platform_payout_controls", "control_key", "default", "*"),
            ]);
            const payouts = objectAt(objectAt(settings, "payments"), "payouts");
            const interval = stringAt(objectAt(payouts, "schedule"), "interval");
            const minimum = numberAt(objectAt(payouts, "minimum_balance_by_currency"), "eur") ?? 0;
            platformControlDrift =
                !control ||
                interval !== protectedPlatformPayoutInterval ||
                minimum < Math.max(control.required_minimum_amount, control.provider_minimum_amount);
        } catch {
            platformControlDrift = true;
        }
    }
    await upsertRow<JsonRecord>("payout_events", "stripe_payout_id", "*", {
        cms_user_id: account?.cms_user_id ?? null,
        stripe_account_id: stripeAccountId,
        stripe_payout_id: objectId,
        amount: Number.isSafeInteger(providerSnapshot.amount) ? providerSnapshot.amount : null,
        currency: stringAt(providerSnapshot, "currency") || null,
        status: stringAt(providerSnapshot, "status") || eventType.slice("payout.".length),
        failure_code: stringAt(providerSnapshot, "failure_code") || null,
        failure_message: stringAt(providerSnapshot, "failure_message") || null,
        provider_snapshot: providerSnapshot,
    });
    const unexpectedPayout =
        manualPayout || instantPayout || ambiguousPayout || connectedEmergencyHold || platformControlDrift;
    if (account && (failedPayout || unexpectedPayout)) {
        await updateAccountRow(account.cms_user_id, {
            risk_status: "manual_review",
            financial_hold_reason: unexpectedPayout
                ? ambiguousPayout
                    ? "Stripe payout control mode is ambiguous"
                    : connectedEmergencyHold
                      ? "Automatic payout conflicts with an emergency seller hold"
                      : platformControlDrift
                        ? "Automatic payout occurred while platform controls were inconsistent"
                        : "Unexpected manual or instant Stripe payout"
                : "Stripe payout failed",
        });
    }
    if (unexpectedPayout) {
        await upsertProviderException(`unexpected-payout:${stripeAccountId}:${objectId}`, {
            exception_type: "unexpected_provider_payout",
            severity: "critical",
            message: ambiguousPayout
                ? "Stripe payout control mode could not be verified"
                : connectedEmergencyHold
                  ? "Stripe reported an automatic payout during an emergency seller hold"
                  : platformControlDrift
                    ? "Stripe reported an automatic platform payout while payout protection had drifted"
                    : "Stripe reported a platform-controlled manual or instant payout",
            details: {
                stripeAccountId,
                stripePayoutId: objectId,
                eventType,
                providerSnapshot,
                payoutTruthError,
                connectedEmergencyHold,
                platformControlDrift,
            },
        });
    } else {
        await resolveProviderException(`unexpected-payout:${stripeAccountId}:${objectId}`);
    }
    if (failedPayout) {
        await upsertProviderException(`failed-payout:${stripeAccountId}:${objectId}`, {
            exception_type: "provider_payout_failed",
            severity: "critical",
            message: "Stripe reported a failed payout",
            details: { stripeAccountId, stripePayoutId: objectId, eventType, providerSnapshot },
        });
    }
    return true;
}
