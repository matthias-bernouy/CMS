import { AuthValidationError } from "cms-auth/core/validation";

export function normalizeEmail(email: string): string {
    return email.trim().toLowerCase();
}

export function validateEmail(email: string): void {
    if (!email || !email.includes("@")) {
        throw new AuthValidationError("email", "invalid");
    }
}

export function requireToken(token: string): string {
    if (!token) {
        throw new AuthValidationError("token", "required");
    }
    return token;
}
