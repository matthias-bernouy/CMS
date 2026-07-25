import type { SignupLegalAcceptance, SignupLegalAcceptanceStore } from "cms-auth/signup-legal/contracts";

export class InMemorySignupLegalAcceptanceStore implements SignupLegalAcceptanceStore {
    private readonly records: SignupLegalAcceptance[] = [];

    async append(acceptance: SignupLegalAcceptance): Promise<void> {
        if (this.records.some((record) => record.id === acceptance.id || record.cmsUserId === acceptance.cmsUserId)) {
            throw new Error("Signup legal acceptance already exists.");
        }
        this.records.push(structuredClone(acceptance));
    }

    async listForUser(cmsUserId: string): Promise<SignupLegalAcceptance[]> {
        return structuredClone(this.records.filter((record) => record.cmsUserId === cmsUserId));
    }
}
