import { createHash } from "node:crypto";
import { invalid } from "./errors";

const namespace = Buffer.from("98287a4109d15e09b0a04999987652c8", "hex");
/** Stable namespaced UUID; identity is not authority and origin remains a trusted installation input. */
export function templateInstallationId(consumer: string, purpose: string, locale: string): string {
    if (
        !/^[a-z][a-z0-9.-]*\/[a-z][a-z0-9.-]*$/u.test(consumer) ||
        consumer.length > 193 ||
        !/^[A-Za-z][A-Za-z0-9._-]{0,63}$/u.test(purpose) ||
        !/^[a-z]{2,3}(?:-[A-Za-z0-9]{2,8})*$/u.test(locale) ||
        locale.length > 35
    ) {
        invalid();
    }
    const bytes = createHash("sha1")
        .update(namespace)
        .update(JSON.stringify([consumer, purpose, locale.toLowerCase()]))
        .digest()
        .subarray(0, 16);
    bytes[6] = (bytes[6]! & 15) | 80;
    bytes[8] = (bytes[8]! & 63) | 128;
    const hex = bytes.toString("hex");
    return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
}
