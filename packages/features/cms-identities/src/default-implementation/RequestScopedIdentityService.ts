import { aliasKey } from "../core/keys";
import { normalizeBindableIdentityAlias, normalizeIdentityAlias, normalizeTargetAuthority } from "../core/validation";
import type { IdentityAlias, IdentityService, IdentitySubjectId, IdentityValue } from "../interfaces/Identity";

/** Shares identity resolutions for one request and clears them after a bind. */
export class RequestScopedIdentityService implements IdentityService {
    private readonly resolutions = new Map<string, Promise<IdentityValue | null>>();

    constructor(private readonly inner: IdentityService) {}

    async resolve(candidate: IdentityAlias, candidateTargetAuthority: string): Promise<IdentityValue | null> {
        const alias = normalizeIdentityAlias(candidate);
        const targetAuthority = normalizeTargetAuthority(candidateTargetAuthority);
        const key = JSON.stringify([aliasKey(alias), targetAuthority]);
        const cached = this.resolutions.get(key);
        if (cached) {
            return cached;
        }
        const pending = Promise.resolve().then(() => this.inner.resolve(alias, targetAuthority));
        this.resolutions.set(key, pending);
        void pending.catch(() => {
            if (this.resolutions.get(key) === pending) {
                this.resolutions.delete(key);
            }
        });
        return pending;
    }

    async bind(subjectId: IdentitySubjectId, candidate: IdentityAlias): Promise<void> {
        const alias = normalizeBindableIdentityAlias(candidate);
        this.resolutions.clear();
        try {
            await this.inner.bind(subjectId, alias);
        } finally {
            this.resolutions.clear();
        }
    }
}
