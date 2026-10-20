/** Public account lifecycle operations exposed by the Access contract. */
export type PublicAuthActions = {
    signup(input: { email: string; password: string }): Promise<void>;
    requestEmailVerification(input: { email: string }): Promise<{ sent: boolean }>;
    confirmEmailVerification(input: { token: string }): Promise<void>;
    requestPasswordReset(input: { email: string }): Promise<{ sent: boolean }>;
    confirmPasswordReset(input: { token: string; password: string }): Promise<void>;
};
