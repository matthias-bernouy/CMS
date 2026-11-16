import { contractString, z } from "@bernouy/ulvia-sdk";

const hostname = contractString({ minLength: 1, maxLength: 241 });
export const claimZoneInput = z.strictObject({ hostname });
export const changeZoneInput = z.strictObject({ hostname, expectedRevision: z.int().min(1) });
export const zoneSchema = z.strictObject({
    hostname,
    state: z.enum(["pending", "verified", "disabled"]),
    revision: z.int().min(1),
});
export const claimZoneOutput = z.strictObject({
    zone: zoneSchema,
    proof: z.strictObject({
        name: contractString({ minLength: 1, maxLength: 253 }),
        value: contractString({ minLength: 1, maxLength: 256 }),
    }),
});
export const zonePageInput = z.strictObject({ after: hostname.nullable(), limit: z.int().min(1).max(50) });
export const zonePage = z.strictObject({ items: z.array(zoneSchema).max(50), nextCursor: hostname.nullable() });
