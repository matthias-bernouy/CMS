import type { RateLimiter } from "@bernouy/rate-limiter";
import type { Identity } from "cms-auth/accounts/interfaces/UsersRepository";
import type { LocalCredentialStore } from "cms-auth/providers/interfaces/LocalCredentialStore";

export type LocalPasswordProofConfig = {
    credentials: LocalCredentialStore;
    rateLimit?: RateLimiter;
};

export type LocalPasswordProofResult =
    | { ok: true; identity: Identity }
    | { ok: false; error: "invalid_credentials" | "rate_limited" };

/** Password verification is provider logic; sessions and HTTP responses are not. */
export class LocalPasswordProof {
    constructor(private readonly config: LocalPasswordProofConfig) {}

    async verify(email: string | undefined, password: string | undefined): Promise<LocalPasswordProofResult> {
        const key = email && this.config.rateLimit ? `login:email:${email.trim().toLowerCase()}` : null;
        if (key && this.config.rateLimit && !(await this.config.rateLimit.hit(key)).allowed) {
            return { ok: false, error: "rate_limited" };
        }
        const identity = email && password ? await this.config.credentials.verify(email, password) : null;
        if (!identity) {
            return { ok: false, error: "invalid_credentials" };
        }
        if (key && this.config.rateLimit) {
            await this.config.rateLimit.reset(key);
        }
        return { ok: true, identity };
    }
}
