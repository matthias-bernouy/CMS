import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
export const userViewSchema = z
    .strictObject({
        sub: contractString({ maxLength: 200 }),
        administrator: z.boolean(),
        administratorRevision: z.int().min(0).max(9007199254740991),
        createdAt: contractString({ format: "date-time", maxLength: 40 }),
        lastSeenAt: contractString({ format: "date-time", maxLength: 40 }),
        email: contractString({ format: "email", maxLength: 320 }).optional(),
        provider: contractString({ maxLength: 96 }).optional(),
    })
    .readonly();

export const deleteUserInputSchema = z.strictObject({
    sub: contractString({ minLength: 1, maxLength: 200 }),
});

export const deleteUserOutputSchema = z
    .strictObject({
        sub: contractString({ maxLength: 200 }),
        deleted: z.boolean(),
    })
    .readonly();

export const setAdministratorInputSchema = z.strictObject({
    sub: contractString({ minLength: 1, maxLength: 200 }),
    enabled: z.boolean(),
    expectedRevision: z.int().min(0).max(9007199254740991),
});

export const setAdministratorOutputSchema = z
    .strictObject({
        sub: contractString({ maxLength: 200 }),
        administrator: z.boolean(),
        revision: z.int().min(0).max(9007199254740991),
        bootstrap: z.boolean(),
    })
    .readonly();

export const listUsersInputSchema = z.strictObject({
    search: contractString({ maxLength: 320 }).optional(),
    page: z.int().min(1).max(1000000).optional(),
    limit: z.int().min(1).max(100).optional(),
});

export const listUsersOutputSchema = z
    .strictObject({
        users: z.array(userViewSchema).max(100).readonly(),
        total: z.int().min(0).max(9007199254740991),
        page: z.int().min(1).max(1000000),
        limit: z.int().min(1).max(100),
        hasMore: z.boolean(),
    })
    .readonly();
