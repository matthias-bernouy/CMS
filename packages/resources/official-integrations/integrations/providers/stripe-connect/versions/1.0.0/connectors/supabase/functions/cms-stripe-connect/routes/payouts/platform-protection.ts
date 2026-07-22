import { insertRow } from "../../db/postgrest.ts";
import {
    reservePlatformFinancialOperation,
    updateFinancialOperation,
} from "../../db/repositories/financial-operations.ts";
import { platformPayoutControlRpc } from "../../db/repositories/payout-controls.ts";
import type { FinancialOperationRow, PlatformPayoutControlRow } from "../../db/records/operations.ts";
import { balanceSettingsMatchRequest, publicBalanceSettings } from "../../domain/accounts/payout-settings.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import { HttpError } from "../../http/errors.ts";
import { json } from "../../http/responses.ts";
import { retrievePlatformBalanceSettings, updateBalanceSettings } from "../../provider/accounts/balances.ts";
import { digest, stableStripeIdempotencyKey } from "../../shared/crypto.ts";
import { errorMessage, numberAt, objectAt, stripUndefined } from "../../shared/data.ts";
import { protectedPlatformPayoutInterval } from "../../shared/runtime.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { readPlatformPayoutProtectionInput } from "./platform-protection-input.ts";

type PlatformPayoutProtectionDependencies = {
    platformPayoutControl(result: JsonRecord): PlatformPayoutControlRow;
};

export function createConfigurePlatformPayoutProtection({
    platformPayoutControl,
}: PlatformPayoutProtectionDependencies): (request: Request) => Promise<Response> {
    return async function configurePlatformPayoutProtection(request) {
        requireCmsRequest(request, { requireUser: false });
        const {
            changeId,
            minimumBalanceEur,
            liabilityRevision,
            decreaseAuthorizationId,
            delayDaysOverride,
            debitNegativeBalances,
            reason,
        } = await readPlatformPayoutProtectionInput(request);
        const owner = crypto.randomUUID();
        let claim = await platformPayoutControlRpc("claim_platform_payout_protection", {
            p_owner: owner,
            p_required_minimum_amount: minimumBalanceEur ?? 0,
            p_liability_revision: liabilityRevision,
            p_decrease_authorization_id: decreaseAuthorizationId,
        });
        if (claim.claimed !== true) {
            throw new HttpError(
                409,
                "platform payout protection is already being synchronized; the higher requirement was recorded",
            );
        }
        let operation: FinancialOperationRow | null = null;
        let appliedMinimum = 0;
        let appliedDecreaseAuthorizationId: string | null = null;
        try {
            for (let attempt = 0; attempt < 5; attempt++) {
                const control = platformPayoutControl(claim);
                appliedDecreaseAuthorizationId = control.decrease_authorization_id;
                const current = await retrievePlatformBalanceSettings();
                const currentMinimum =
                    numberAt(
                        objectAt(objectAt(objectAt(current, "payments"), "payouts"), "minimum_balance_by_currency"),
                        "eur",
                    ) ?? 0;
                appliedMinimum = control.decrease_authorization_id
                    ? control.required_minimum_amount
                    : Math.max(control.required_minimum_amount, control.provider_minimum_amount, currentMinimum);
                const operationRequest = stripUndefined({
                    scope: "platform",
                    interval: protectedPlatformPayoutInterval,
                    minimumBalanceEur: appliedMinimum,
                    delayDaysOverride: delayDaysOverride ?? undefined,
                    debitNegativeBalances: debitNegativeBalances ?? undefined,
                    reason: reason ?? undefined,
                    commerceLiabilityRevision: control.liability_revision,
                    commerceRequestedDecreaseAuthorizationId: decreaseAuthorizationId ?? undefined,
                    commerceAppliedDecreaseAuthorizationId: appliedDecreaseAuthorizationId ?? undefined,
                });
                const requestHash = await digest(JSON.stringify(operationRequest));
                const businessKey = [
                    "platform-payout-protection",
                    control.liability_revision,
                    appliedMinimum,
                    requestHash,
                ].join(":");
                operation = await reservePlatformFinancialOperation({
                    businessKey,
                    operationType: "payout_schedule_update",
                    request: operationRequest,
                });
                let provider = current;
                if (!balanceSettingsMatchRequest(current, operationRequest)) {
                    await updateFinancialOperation(operation.id, {
                        status: "processing",
                        claimed_at: new Date().toISOString(),
                        attempt_count: operation.attempt_count + 1,
                    });
                    provider = await updateBalanceSettings(
                        null,
                        operationRequest,
                        await stableStripeIdempotencyKey("platform-payout-protection", businessKey),
                    );
                }
                if (!balanceSettingsMatchRequest(provider, operationRequest)) {
                    throw new Error("Stripe did not confirm the required platform payout protection");
                }
                if (operation.status !== "succeeded" || provider !== current) {
                    await updateFinancialOperation(operation.id, {
                        status: "succeeded",
                        response: provider,
                        last_error: null,
                        completed_at: new Date().toISOString(),
                    });
                }
                const completed = await platformPayoutControlRpc("complete_platform_payout_protection", {
                    p_owner: owner,
                    p_expected_liability_revision: control.liability_revision,
                    p_applied_minimum_amount: appliedMinimum,
                    p_succeeded: true,
                    p_error: null,
                });
                if (completed.accepted !== true) {
                    throw new HttpError(409, "platform payout protection lease was superseded");
                }
                if (completed.needsReapply === true) {
                    claim = { claimed: true, control: objectAt(completed, "control") };
                    continue;
                }
                return json({
                    platformPayoutControlChangeId: changeId,
                    providerOperationId: operation.id,
                    liabilityRevision: platformPayoutControl(completed).liability_revision,
                    appliedMinimumBalanceEur: appliedMinimum,
                    decreaseAuthorizationId: appliedDecreaseAuthorizationId,
                    payoutControl: publicBalanceSettings(provider),
                    providerSnapshot: provider,
                });
            }
            throw new Error("platform payout requirements changed repeatedly during provider synchronization");
        } catch (error) {
            const message = errorMessage(error);
            if (operation) {
                await updateFinancialOperation(operation.id, { status: "manual_review", last_error: message }).catch(
                    () => null,
                );
            }
            const control = platformPayoutControl(claim);
            await platformPayoutControlRpc("complete_platform_payout_protection", {
                p_owner: owner,
                p_expected_liability_revision: control.liability_revision,
                p_applied_minimum_amount: appliedMinimum,
                p_succeeded: false,
                p_error: message,
            }).catch(() => null);
            await insertRow<JsonRecord>("provider_exceptions", "id", {
                operation_id: operation?.id ?? null,
                exception_type: "platform_payout_protection_ambiguous",
                severity: "critical",
                message,
                details: {
                    platformPayoutControlChangeId: changeId,
                    requestedMinimumBalanceEur: minimumBalanceEur ?? 0,
                    liabilityRevision: control.liability_revision,
                },
            }).catch(() => null);
            throw error;
        }
    };
}
