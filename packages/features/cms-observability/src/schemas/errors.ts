import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";
const messageSchema = z.strictObject({ message: contractString({ minLength: 1, maxLength: 2048 }) });
const refused = { retryable: false, output: messageSchema };
const unavailable = { retryable: true, output: messageSchema };
export const appendErrors = {
    INVALID_INPUT: refused,
    CORE_UNAVAILABLE: unavailable,
    FORBIDDEN: refused,
    ENTRY_CONFLICT: refused,
};
export const getErrors = { INVALID_INPUT: refused, CORE_UNAVAILABLE: unavailable, NOT_FOUND: refused };
export const queryErrors = { INVALID_INPUT: refused, CORE_UNAVAILABLE: unavailable, INVALID_CURSOR: refused };
export const aggregateErrors = { INVALID_INPUT: refused, CORE_UNAVAILABLE: unavailable };
