import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";

export const fileErrorSchema = z.strictObject({ message: contractString({ minLength: 1, maxLength: 2048 }) });
const refused = { retryable: false, output: fileErrorSchema };
const unavailable = { retryable: true, output: fileErrorSchema };

export const completeUploadErrors = {
    INVALID_INPUT: refused,
    NOT_AUTHORIZED: refused,
    NOT_FOUND: refused,
    CORE_UNAVAILABLE: unavailable,
    QUOTA_EXCEEDED: refused,
    UPLOAD_NOT_READY: refused,
};

export const completeWorkspaceUploadErrors = {
    INVALID_INPUT: refused,
    NOT_FOUND: refused,
    UPLOAD_NOT_READY: unavailable,
    QUOTA_EXCEEDED: refused,
    CORE_UNAVAILABLE: unavailable,
};

export const credentialErrors = {
    INVALID_INPUT: refused,
    NOT_AUTHORIZED: refused,
    NOT_FOUND: refused,
    CORE_UNAVAILABLE: unavailable,
};

export const createNamespaceErrors = {
    INVALID_INPUT: refused,
    CORE_UNAVAILABLE: unavailable,
};

export const createUploadErrors = {
    INVALID_INPUT: refused,
    NOT_AUTHORIZED: refused,
    NOT_FOUND: refused,
    CORE_UNAVAILABLE: unavailable,
    QUOTA_EXCEEDED: refused,
};

export const createWorkspaceUploadErrors = {
    INVALID_INPUT: refused,
    NOT_FOUND: refused,
    CORE_UNAVAILABLE: unavailable,
    QUOTA_EXCEEDED: refused,
};

export const workspaceErrors = {
    INVALID_INPUT: refused,
    NOT_FOUND: refused,
    CORE_UNAVAILABLE: unavailable,
};

export const writeUploadErrors = {
    INVALID_INPUT: refused,
    NOT_AUTHORIZED: refused,
    SIZE_MISMATCH: refused,
    CORE_UNAVAILABLE: unavailable,
};

export const listRepresentationsErrors = {
    NOT_AUTHORIZED: refused,
    NOT_FOUND: refused,
    CORE_UNAVAILABLE: unavailable,
};

export const readFileErrors = {
    NOT_AUTHORIZED: refused,
    NOT_FOUND: refused,
    RANGE_NOT_SATISFIABLE: refused,
    CORE_UNAVAILABLE: unavailable,
};
