import type { Subject } from "cms-auth/application/interfaces/Authentication";

/** Capability-limited operations required by public-auth HTTP consumers. */
export type PublicAuthActions = {
    buildLoginUrl(returnTo: string): string;
    login(request: Request): Promise<Response>;
    logout(): Response;
    subject(request: Request): Promise<Subject | null>;
    signup(input: { email: string; password: string }): Promise<void>;
    requestEmailVerification(input: { email: string }): Promise<{ sent: boolean }>;
    confirmEmailVerification(input: { token: string }): Promise<void>;
    requestPasswordReset(input: { email: string }): Promise<{ sent: boolean }>;
    confirmPasswordReset(input: { token: string; password: string }): Promise<void>;
};
