import { randomBytes, createHash } from "node:crypto";
import type { AuthTokenPurpose } from "cms-auth/tokens/one-time/interfaces/AuthTokenStore";

export const mintAuthToken = (): string => `auth_${randomBytes(32).toString("base64url")}`;

export const hashAuthToken = (token: string): string => createHash("sha256").update(token).digest("hex");

export const hashAuthTokenReservation = (token: string, purpose: AuthTokenPurpose, operation: string): string =>
    createHash("sha256").update(token).update("\0").update(purpose).update("\0").update(operation).digest("hex");
