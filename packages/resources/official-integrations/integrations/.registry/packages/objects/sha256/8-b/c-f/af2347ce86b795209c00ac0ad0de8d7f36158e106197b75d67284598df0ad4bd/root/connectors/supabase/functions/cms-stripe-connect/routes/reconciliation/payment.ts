import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { publicPayment } from "../../domain/payments/presentation.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import { assertAllowedKeys, readJsonObject, requiredInteger } from "../../http/body/index.ts";
import { json } from "../../http/responses.ts";
import type { ReconcilePayment } from "../../workflows/reconciliation/payment.ts";

type ReconcileProviderPaymentDependencies = {
    reconcilePayment: ReconcilePayment;
    requiredPayment(paymentId: number): Promise<ConnectPaymentRow>;
};

export function createReconcileProviderPayment({
    reconcilePayment,
    requiredPayment,
}: ReconcileProviderPaymentDependencies): (request: Request) => Promise<Response> {
    return async function reconcileProviderPayment(request) {
        requireCmsRequest(request, { requireUser: false });
        const body = await readJsonObject(request);
        assertAllowedKeys(body, ["paymentId"]);
        const payment = await requiredPayment(requiredInteger(body, "paymentId"));
        return json(publicPayment(await reconcilePayment(payment)));
    };
}
