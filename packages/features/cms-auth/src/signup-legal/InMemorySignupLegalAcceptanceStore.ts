import type { SignupLegalAcceptance, SignupLegalAcceptanceStore } from "cms-auth/signup-legal/contracts";
import { sameSignupLegalAcceptancePayload } from "cms-auth/signup-legal/acceptanceIdentity";

export class InMemorySignupLegalAcceptanceStore implements SignupLegalAcceptanceStore {
    private readonly records: SignupLegalAcceptance[] = [];

    async append(acceptance: SignupLegalAcceptance): Promise<void> {
        const existing = this.records.find((record) => record.id === acceptance.id);
        if (existing) {
            if (sameSignupLegalAcceptancePayload(existing, acceptance)) {
                return;
            }
            throw new Error("Signup legal acceptance id conflicts with different immutable evidence.");
        }
        this.records.push(structuredClone(acceptance));
    }

    async listForUser(cmsUserId: string): Promise<SignupLegalAcceptance[]> {
        return structuredClone(this.records.filter((record) => record.cmsUserId === cmsUserId));
    }
}
