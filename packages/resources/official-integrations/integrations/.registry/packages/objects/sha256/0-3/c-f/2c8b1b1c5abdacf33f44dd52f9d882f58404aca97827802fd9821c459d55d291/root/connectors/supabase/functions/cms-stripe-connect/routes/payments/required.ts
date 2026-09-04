import { getPaymentRow } from "../../db/repositories/payments.ts";
import type { ConnectPaymentRow } from "../../db/records/payments.ts";
import { HttpError } from "../../http/errors.ts";

export async function requiredPayment(paymentId: number): Promise<ConnectPaymentRow> {
    const payment = await getPaymentRow(paymentId);
    if (!payment) {
        throw new HttpError(404, "payment not found");
    }
    return payment;
}
