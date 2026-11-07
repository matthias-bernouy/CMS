import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
const payload = z.strictObject({ message: contractString({ minLength: 1, maxLength: 2048 }) });
const refused = { retryable: false, output: payload };
const retryable = { retryable: true, output: payload };
export const inputErrors = { INVALID_INPUT: refused, CORE_UNAVAILABLE: retryable };
export const createPersonalAccessTokenErrors = {
    INVALID_INPUT: refused,
    ACTOR_UNAVAILABLE: refused,
    CORE_UNAVAILABLE: retryable,
    TOKEN_LIMIT: refused,
};
export const deleteUserErrors = {
    NOT_FOUND: refused,
    CANNOT_REMOVE_SELF: refused,
    PROTECTED_USER: refused,
    ACTOR_UNAVAILABLE: refused,
    CORE_UNAVAILABLE: retryable,
};
export const loginPasswordErrors = {
    INVALID_CREDENTIALS: refused,
    RATE_LIMITED: retryable,
    CORE_UNAVAILABLE: retryable,
};
export const serviceErrors = { CORE_UNAVAILABLE: retryable };
export const revokePersonalAccessTokenErrors = {
    INVALID_INPUT: refused,
    ACTOR_UNAVAILABLE: refused,
    CORE_UNAVAILABLE: retryable,
    NOT_FOUND: refused,
};
export const setAdministratorErrors = {
    INVALID_INPUT: refused,
    NOT_FOUND: refused,
    CANNOT_REMOVE_SELF: refused,
    REVISION_CONFLICT: refused,
    ACTOR_UNAVAILABLE: refused,
    CORE_UNAVAILABLE: retryable,
};
export const getUserErrors = { NOT_FOUND: refused, CORE_UNAVAILABLE: retryable };
export const inspectActorErrors = { FORBIDDEN: refused };
export const listPersonalAccessTokensErrors = {
    INVALID_INPUT: refused,
    ACTOR_UNAVAILABLE: refused,
    CORE_UNAVAILABLE: retryable,
};
