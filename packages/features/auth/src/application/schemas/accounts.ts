import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const confirmEmailVerificationInputSchema = z.strictObject({
    token: contractString({ sensitive: true, minLength: 1, maxLength: 4096 }),
});

export const confirmedSchema = z
    .strictObject({
        confirmed: z.boolean(),
    })
    .readonly();

export const confirmPasswordResetInputSchema = z.strictObject({
    token: contractString({ sensitive: true, minLength: 1, maxLength: 4096 }),
    password: contractString({ sensitive: true, minLength: 8, maxLength: 4096 }),
});

export const emailInputSchema = z.strictObject({
    email: contractString({ format: "email", maxLength: 320 }),
});

export const sentSchema = z
    .strictObject({
        sent: z.boolean(),
    })
    .readonly();

export const signupInputSchema = z.strictObject({
    email: contractString({ format: "email", maxLength: 320 }),
    password: contractString({ sensitive: true, minLength: 8, maxLength: 4096 }),
});

export const signupOutputSchema = z
    .strictObject({
        accepted: z.boolean(),
    })
    .readonly();
