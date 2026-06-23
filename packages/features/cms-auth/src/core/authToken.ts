import { randomBytes, createHash } from "node:crypto";

export const mintAuthToken = (): string => `auth_${randomBytes(32).toString("base64url")}`;

export const hashAuthToken = (token: string): string =>
    createHash("sha256").update(token).digest("hex");
