import { createHash } from "node:crypto";
import { canonicalizeIJson } from "@bernouy/cms-repository/contracts/protocol";

export function ticketHash(ticket: string) {
    return createHash("sha256").update(`ulvia-delegation-v1\0${ticket}`).digest("hex");
}
export function fingerprint(value: unknown) {
    return createHash("sha256").update(canonicalizeIJson(value)).digest("hex");
}
