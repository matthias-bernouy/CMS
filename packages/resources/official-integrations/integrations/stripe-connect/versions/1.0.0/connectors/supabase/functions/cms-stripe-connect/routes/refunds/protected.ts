import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import {
    assertAllowedKeys,
    optionalPositiveInteger,
    optionalText,
    readJsonObject,
    requiredInteger,
    requiredString,
} from "../../http/body/index.ts";
import { json } from "../../http/responses.ts";
import type { ExecuteProtectedRefund, ProtectedRefundInput } from "../../workflows/refunds/protected.ts";

type ProtectedRefundRouteDependencies = {
    executeProtectedRefund: ExecuteProtectedRefund;
    reconcilePayment(payment: ConnectPaymentRow): Promise<ConnectPaymentRow>;
    requiredPayment(paymentId: number): Promise<ConnectPaymentRow>;
};

export function createRequestProtectedRefund({
    executeProtectedRefund,
    reconcilePayment,
    requiredPayment,
}: ProtectedRefundRouteDependencies): (request: Request) => Promise<Response> {
    return async function requestProtectedRefund(request) {
        requireCmsRequest(request, { requireUser: false });
        const body = await readJsonObject(request);
        assertAllowedKeys(body, [
            "paymentId",
            "refundRequestId",
            "commerceRefundRequestId",
            "amount",
            "authorizedSellerAmount",
            "sellerEntitlementReductionAmount",
            "reason",
        ]);
        let payment = await requiredPayment(requiredInteger(body, "paymentId"));
        payment = await reconcilePayment(payment);
        const input: ProtectedRefundInput = {
            refundRequestId: requiredString(body, "refundRequestId", 200),
            commerceRefundRequestId: optionalPositiveInteger(body, "commerceRefundRequestId"),
            amount: requiredInteger(body, "amount"),
            authorizedSellerAmount: requiredInteger(body, "authorizedSellerAmount"),
            sellerEntitlementReductionAmount: requiredInteger(body, "sellerEntitlementReductionAmount"),
            reason: optionalText(body, "reason", 500),
        };
        return json(await executeProtectedRefund(payment, input));
    };
}
