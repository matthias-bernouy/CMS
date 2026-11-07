import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const loginPasswordInputSchema = z.strictObject({
    email: contractString({ format: "email", maxLength: 320 }),
    password: contractString({ sensitive: true, minLength: 1, maxLength: 4096 }),
});

export const loginPasswordOutputSchema = z
    .strictObject({
        subjectId: contractString({ maxLength: 200 }),
        administrator: z.boolean(),
    })
    .readonly();

export const emptyInputSchema = z.strictObject({});

export const logoutOutputSchema = z
    .strictObject({
        cleared: z.boolean(),
    })
    .readonly();
