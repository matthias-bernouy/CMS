import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";

const secretErrorSchema = z.strictObject({ message: contractString({ minLength: 1, maxLength: 2048 }) });
const refused = { retryable: false, output: secretErrorSchema };
const unavailable = { retryable: true, output: secretErrorSchema };
export const namespaceCreationErrors = { INVALID_INPUT: refused, CORE_UNAVAILABLE: unavailable };
const authorizedErrors = { INVALID_INPUT: refused, NOT_AUTHORIZED: refused };
export const namespaceErrors = { ...authorizedErrors, NOT_FOUND: refused, CORE_UNAVAILABLE: unavailable };
export const secretCreationErrors = {
    ...authorizedErrors,
    NOT_FOUND: refused,
    ALREADY_EXISTS: refused,
    CORE_UNAVAILABLE: unavailable,
};
export const secretMutationErrors = {
    ...authorizedErrors,
    NOT_FOUND: refused,
    VERSION_CONFLICT: refused,
    CORE_UNAVAILABLE: unavailable,
};
export const secretDeletionErrors = { ...authorizedErrors, VERSION_CONFLICT: refused, CORE_UNAVAILABLE: unavailable };
export const namedSecretErrors = { ...authorizedErrors, CORE_UNAVAILABLE: unavailable };
