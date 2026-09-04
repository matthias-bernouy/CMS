import {
    assertAllowedKeys,
    optionalBoolean,
    optionalNonNegativeInteger,
    optionalText,
    readJsonObject,
    requiredInteger,
    requiredString,
} from "../../http/body/index.ts";
import { HttpError } from "../../http/errors.ts";

type PlatformPayoutProtectionInput = {
    changeId: string;
    minimumBalanceEur: number | null;
    liabilityRevision: number;
    decreaseAuthorizationId: string | null;
    delayDaysOverride: number | null;
    debitNegativeBalances: boolean | null;
    reason: string | null;
};

export async function readPlatformPayoutProtectionInput(request: Request): Promise<PlatformPayoutProtectionInput> {
    const body = await readJsonObject(request);
    assertAllowedKeys(body, [
        "platformPayoutControlChangeId",
        "minimumBalanceEur",
        "delayDaysOverride",
        "debitNegativeBalances",
        "reason",
        "liabilityRevision",
        "decreaseAuthorizationId",
    ]);
    const changeId = requiredString(body, "platformPayoutControlChangeId", 200);
    const minimumBalanceEur = optionalNonNegativeInteger(body, "minimumBalanceEur");
    const liabilityRevision = requiredInteger(body, "liabilityRevision");
    if (!Number.isSafeInteger(liabilityRevision) || liabilityRevision < 0) {
        throw new HttpError(400, "liabilityRevision must be a non-negative safe integer");
    }
    const decreaseAuthorizationId = optionalText(body, "decreaseAuthorizationId", 64);
    if (
        decreaseAuthorizationId &&
        !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(decreaseAuthorizationId)
    ) {
        throw new HttpError(400, "decreaseAuthorizationId must be a UUID");
    }
    const delayDaysOverride = optionalNonNegativeInteger(body, "delayDaysOverride");
    const debitNegativeBalances = optionalBoolean(body, "debitNegativeBalances");
    const reason = optionalText(body, "reason", 500);
    if (delayDaysOverride !== null && delayDaysOverride > 31) {
        throw new HttpError(400, "delayDaysOverride must be between zero and 31");
    }
    return {
        changeId,
        minimumBalanceEur,
        liabilityRevision,
        decreaseAuthorizationId,
        delayDaysOverride,
        debitNegativeBalances,
        reason,
    };
}
