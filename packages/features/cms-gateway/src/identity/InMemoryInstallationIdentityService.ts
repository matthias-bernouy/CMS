import { identityAliasKey, identityScopeKey, identitySubjectKey } from "../core/identityKeys";
import type { InstallationIdentityScope, InstallationIdentityService } from "./InstallationIdentityService";

/** In-memory test adapter; production requires an atomic durable store. */
export class InMemoryInstallationIdentityService implements InstallationIdentityService {
    readonly #bySubject = new Map<string, string>();
    readonly #byAlias = new Map<string, string>();

    async getOrCreate(scope: InstallationIdentityScope, cmsSubjectId: string): Promise<string> {
        const key = identitySubjectKey(scope, cmsSubjectId);
        const existing = this.#bySubject.get(key);
        if (existing) {
            return existing;
        }
        const alias = crypto.randomUUID();
        this.#bySubject.set(key, alias);
        this.#byAlias.set(identityAliasKey(scope, alias), cmsSubjectId);
        return alias;
    }

    async resolve(scope: InstallationIdentityScope, providerSubjectId: string): Promise<string | null> {
        return this.#byAlias.get(identityAliasKey(scope, providerSubjectId)) ?? null;
    }

    async revoke(scope: InstallationIdentityScope): Promise<void> {
        const prefix = identityScopeKey(scope);
        for (const key of this.#bySubject.keys()) {
            if (JSON.parse(key)[0] === prefix) {
                this.#bySubject.delete(key);
            }
        }
        for (const key of this.#byAlias.keys()) {
            if (JSON.parse(key)[0] === prefix) {
                this.#byAlias.delete(key);
            }
        }
    }
}
