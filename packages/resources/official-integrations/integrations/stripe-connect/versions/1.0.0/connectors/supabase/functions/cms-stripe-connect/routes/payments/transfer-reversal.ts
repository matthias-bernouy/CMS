import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import {
    assertAllowedKeys,
    optionalText,
    readJsonObject,
    requiredInteger,
    requiredString,
} from "../../http/body/index.ts";
import { json } from "../../http/responses.ts";
import type { ExecuteTransferReversal } from "../../workflows/payments/transfer-reversal/workflow.ts";

type TransferReversalRouteDependencies = {
    executeTransferReversal: ExecuteTransferReversal;
    requiredPayment(paymentId: number): Promise<ConnectPaymentRow>;
};

export function createRequestTransferReversal({
    executeTransferReversal,
    requiredPayment,
}: TransferReversalRouteDependencies): (request: Request) => Promise<Response> {
    return async function requestTransferReversal(request) {
        requireCmsRequest(request, { requireUser: false });
        const body = await readJsonObject(request);
        assertAllowedKeys(body, ["paymentId", "reversalRequestId", "amount", "reason"]);
        const payment = await requiredPayment(requiredInteger(body, "paymentId"));
        const result = await executeTransferReversal(
            payment,
            requiredString(body, "reversalRequestId", 200),
            requiredInteger(body, "amount"),
            optionalText(body, "reason", 500),
        );
        return json(result);
    };
}
