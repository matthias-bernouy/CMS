import { lossless } from "forms/core/inputBounds";
import type { FormsNotification } from "forms/notifications/interfaces/FormsDelivery";

export const notificationLimits = Object.freeze({ subjectUnits: 998, textBytes: 131072 });
const encoder = new TextEncoder();
export function isNotificationContent(value: unknown): value is FormsNotification {
    if (typeof value !== "object" || value === null || !("subject" in value) || !("text" in value)) {
        return false;
    }
    const { subject, text } = value;
    return (
        typeof subject === "string" &&
        typeof text === "string" &&
        lossless(value) &&
        subject.length <= notificationLimits.subjectUnits &&
        !/[\r\n]/.test(subject) &&
        !!subject.trim() &&
        text.length <= notificationLimits.textBytes &&
        !!text.trim() &&
        encoder.encode(text).length <= notificationLimits.textBytes
    );
}
