import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import {
    assertAllowedKeys,
    optionalCurrency,
    readJsonObject,
    requiredInteger,
    requiredString,
} from "../../http/body.ts";
import { requiredReleaseKind } from "../../http/query.ts";
import { json } from "../../http/responses.ts";
import type { ExecuteSettlementRelease } from "../../workflows/payments/settlement-release.ts";

type SettlementReleaseRouteDependencies = {
    executeSettlementRelease: ExecuteSettlementRelease;
    requiredPayment(paymentId: number): Promise<ConnectPaymentRow>;
};

export function createRequestSettlementRelease({
    executeSettlementRelease,
    requiredPayment,
}: SettlementReleaseRouteDependencies): (request: Request) => Promise<Response> {
    return async function requestSettlementRelease(request) {
        requireCmsRequest(request, { requireUser: false });
        const body = await readJsonObject(request);
        assertAllowedKeys(body, ["paymentId", "releaseAuthorizationId", "releaseKind", "amount", "currency"]);
        const payment = await requiredPayment(requiredInteger(body, "paymentId"));
        const releaseAuthorizationId = requiredString(body, "releaseAuthorizationId", 200);
        const releaseKind = requiredReleaseKind(body.releaseKind);
        const amount = requiredInteger(body, "amount");
        const currency = optionalCurrency(body, "currency") ?? payment.currency;
        return json(await executeSettlementRelease(payment, releaseAuthorizationId, releaseKind, amount, currency));
    };
}
