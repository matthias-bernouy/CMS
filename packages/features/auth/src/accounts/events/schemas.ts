import { contractString, z } from "@bernouy/ulvia-sdk";
const accountRef = contractString({ format: "uuid", maxLength: 36 });
const timestamp = contractString({ format: "date-time", maxLength: 40 });
export const accountCreatedPayload = z.strictObject({
    accountRef,
    provider: contractString({ minLength: 1, maxLength: 96 }),
    createdAt: timestamp,
});
export const emailVerifiedPayload = z.strictObject({
    accountRef,
    accountCreatedAt: timestamp,
    verifiedAt: timestamp,
    method: contractString({ enum: ["email-link", "password-reset"], maxLength: 14 }),
});
