import { platformPayoutControlRpc } from "../../db/repositories/payout-controls.ts";
import type { JsonRecord } from "../../shared/types.ts";

const leaseRetryCount = 20;
const leaseRetryDelayMs = 100;

type PlatformPayoutProtectionClaimInput = {
    owner: string;
    requiredMinimumAmount: number;
    liabilityRevision: number;
    decreaseAuthorizationId: string | null;
};

export async function claimPlatformPayoutProtectionLease({
    owner,
    requiredMinimumAmount,
    liabilityRevision,
    decreaseAuthorizationId,
}: PlatformPayoutProtectionClaimInput): Promise<JsonRecord> {
    const body = {
        p_owner: owner,
        p_required_minimum_amount: requiredMinimumAmount,
        p_liability_revision: liabilityRevision,
        p_decrease_authorization_id: decreaseAuthorizationId,
    };
    let claim = await platformPayoutControlRpc("claim_platform_payout_protection", body);
    for (let retry = 0; claim.claimed !== true && retry < leaseRetryCount; retry++) {
        await pause(leaseRetryDelayMs);
        claim = await platformPayoutControlRpc("claim_platform_payout_protection", body);
    }
    return claim;
}

function pause(milliseconds: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, milliseconds));
}
