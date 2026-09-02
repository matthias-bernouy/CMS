import { getRowByField } from "../../../db/postgrest.ts";
import { resolveProviderException, upsertProviderException } from "../../../db/repositories/events-exceptions.ts";
import type { PlatformPayoutControlRow } from "../../../db/records/operations.ts";
import { HttpError } from "../../../http/errors.ts";
import { retrievePlatformBalanceSettings } from "../../../provider/accounts/balances.ts";
import { protectedPlatformPayoutInterval } from "../../../shared/runtime.ts";
import { errorMessage, numberAt, objectAt, stringAt } from "../../../shared/data.ts";

export type PlatformPayoutReconciliation = {
    exceptions: number;
    platformPayoutInterval: string;
    platformPayoutMinimum: number;
    platformRequiredMinimum: number;
};

export async function assertPlatformPayoutProtection(): Promise<void> {
    const [settings, control] = await Promise.all([
        retrievePlatformBalanceSettings(),
        getRowByField<PlatformPayoutControlRow>("platform_payout_controls", "control_key", "default", "*"),
    ]);
    if (!control) {
        throw new HttpError(503, "platform payout protection state is unavailable");
    }
    const interval = stringAt(objectAt(objectAt(objectAt(settings, "payments"), "payouts"), "schedule"), "interval");
    if (interval !== protectedPlatformPayoutInterval) {
        throw new HttpError(503, "protected payments require the configured automatic Stripe platform payout schedule");
    }
    const providerMinimum =
        numberAt(objectAt(objectAt(objectAt(settings, "payments"), "payouts"), "minimum_balance_by_currency"), "eur") ??
        0;
    if (providerMinimum < control.required_minimum_amount || providerMinimum < control.provider_minimum_amount) {
        throw new HttpError(503, "protected payments require the current Stripe platform minimum balance");
    }
}

export async function reconcilePlatformPayoutProtection(): Promise<PlatformPayoutReconciliation> {
    let exceptions = 0;
    let platformPayoutInterval = "unknown";
    let platformPayoutMinimum = 0;
    let platformRequiredMinimum = 0;
    try {
        const [platformSettings, platformControl] = await Promise.all([
            retrievePlatformBalanceSettings(),
            getRowByField<PlatformPayoutControlRow>("platform_payout_controls", "control_key", "default", "*"),
        ]);
        if (!platformControl) {
            throw new Error("platform payout control state is unavailable");
        }
        platformPayoutInterval =
            stringAt(objectAt(objectAt(objectAt(platformSettings, "payments"), "payouts"), "schedule"), "interval") ||
            "unknown";
        platformPayoutMinimum =
            numberAt(
                objectAt(objectAt(objectAt(platformSettings, "payments"), "payouts"), "minimum_balance_by_currency"),
                "eur",
            ) ?? 0;
        platformRequiredMinimum = Math.max(
            platformControl.required_minimum_amount,
            platformControl.provider_minimum_amount,
        );
        await resolveProviderException("platform-payout-settings-unavailable");
        if (platformPayoutInterval !== protectedPlatformPayoutInterval) {
            exceptions++;
            await upsertProviderException("platform-payout-schedule-drift", {
                exception_type: "platform_payout_schedule_drift",
                severity: "critical",
                status: "open",
                message:
                    "Stripe platform payout schedule is not the protected automatic schedule; new protected payments are blocked",
                details: { platformPayoutInterval, providerSnapshot: platformSettings },
            });
        } else {
            await resolveProviderException("platform-payout-schedule-drift");
        }
        if (platformPayoutMinimum < platformRequiredMinimum) {
            exceptions++;
            await upsertProviderException("platform-payout-minimum-drift", {
                exception_type: "platform_payout_minimum_drift",
                severity: "critical",
                status: "open",
                message: "Stripe platform minimum balance is below the monotonic protected liability requirement",
                details: {
                    platformPayoutMinimum,
                    platformRequiredMinimum,
                    liabilityRevision: platformControl.liability_revision,
                },
            });
        } else {
            await resolveProviderException("platform-payout-minimum-drift");
        }
    } catch (error) {
        exceptions++;
        await upsertProviderException("platform-payout-settings-unavailable", {
            exception_type: "platform_payout_settings_unavailable",
            severity: "critical",
            status: "open",
            message: errorMessage(error),
            details: {},
        }).catch(() => null);
    }
    return { exceptions, platformPayoutInterval, platformPayoutMinimum, platformRequiredMinimum };
}
