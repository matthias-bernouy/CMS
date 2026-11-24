import { z } from "@bernouy/ulvia-sdk";
import { parseStrictJson } from "@bernouy/ulvia-contracts/protocol";
import type { FieldCrypto } from "@bernouy/envelope-crypto";
import { EventsError } from "@bernouy/cms-events";
const id = z.string().min(1).max(256);
const owner = z.strictObject({ siteId: id, installationId: id, namespace: id });
const actor = z.discriminatedUnion("kind", [
    z.strictObject({ kind: z.literal("user"), subjectId: id }),
    z.strictObject({ kind: z.literal("system"), authority: id, serviceId: id.optional() }),
    z.strictObject({ kind: z.literal("anonymous") }),
]);
const claims = z.strictObject({
    format: z.literal("ulvia-event-initiator/v1"),
    instanceId: id,
    owner,
    definitionId: z.string().regex(/^[a-f0-9]{64}$/u),
    eventType: id,
    occurrenceId: id,
    actor,
});
export type InitiatorClaims = z.infer<typeof claims>;
export type InitiatorActor = InitiatorClaims["actor"];
export function originCodec(crypto: Pick<FieldCrypto, "encrypt" | "decrypt">, instanceId: string, siteId: string) {
    return {
        async seal(value: InitiatorClaims) {
            const checked = claims.parse(value);
            if (checked.instanceId !== instanceId || checked.owner.siteId !== siteId) {
                throw new EventsError("FORBIDDEN");
            }
            const blob = await crypto.encrypt(JSON.stringify(checked));
            const proof = `ei1.${blob.iv.toString("base64url")}.${blob.ciphertext.toString("base64url")}`;
            if (proof.length > 2048) {
                throw new EventsError("CAPACITY_EXCEEDED");
            }
            return proof;
        },
        async open(proof: string): Promise<InitiatorClaims> {
            try {
                if (
                    typeof proof !== "string" ||
                    proof.length > 2048 ||
                    !/^ei1\.[A-Za-z0-9_-]{16}\.[A-Za-z0-9_-]+$/u.test(proof)
                ) {
                    throw new Error("Invalid origin reference");
                }
                const [, ivText, ciphertextText] = proof.split(".");
                const iv = Buffer.from(ivText!, "base64url");
                const ciphertext = Buffer.from(ciphertextText!, "base64url");
                if (iv.toString("base64url") !== ivText || ciphertext.toString("base64url") !== ciphertextText) {
                    throw new Error("Noncanonical origin reference");
                }
                const text = await crypto.decrypt({ iv, ciphertext });
                const checked = claims.parse(parseStrictJson(new TextEncoder().encode(text), 1536, 8));
                if (checked.instanceId !== instanceId || checked.owner.siteId !== siteId) {
                    throw new Error("Foreign origin reference");
                }
                return checked;
            } catch {
                throw new EventsError("FORBIDDEN");
            }
        },
    };
}
