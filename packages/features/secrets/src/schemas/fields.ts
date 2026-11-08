import { z } from "zod";
import { contractString } from "@bernouy/ulvia-sdk";

export const secretNamespacePermissions = [
    "secrets.metadata.read",
    "secrets.resolve",
    "secrets.write",
    "secrets.delete",
    "namespace.manage",
] as const;
export const namespacePermissionSchema = contractString({ enum: secretNamespacePermissions, maxLength: 32 });
export const namespaceCredentialsSchema = z.strictObject({
    namespaceId: contractString({ minLength: 1, maxLength: 128 }),
    namespaceKey: contractString({ sensitive: true, minLength: 20, maxLength: 512 }),
});
export const secretNameSchema = contractString({ minLength: 1, maxLength: 96 });
export const secretIdSchema = contractString({ minLength: 1, maxLength: 160 });
export const secretValueSchema = contractString({ sensitive: true, minLength: 1, maxLength: 16384 });
export const secretVersionSchema = z.int().min(1).max(Number.MAX_SAFE_INTEGER);
export const secretDateSchema = contractString({ format: "date-time", maxLength: 40 });
