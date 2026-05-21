import {
    createProvider, MemoryTenantConfigStore, type LogStore,
} from "@bernouy/data-provider-sdk";
import { NotesStore } from "./notesStore";
import { makeHooks } from "./hooks";
import { makeDomain } from "./domain";
import { NOTES_TENANT_CONFIG } from "./tenantConfig";

/**
 * The entire wiring of a conforming official data-provider. Everything in
 * base.md (auth, planes, provisioning, logs, RFC 7807, OpenAPI admin,
 * §11 tenant config — schema + storage + endpoints) comes from the SDK;
 * this file just injects the domain + hooks + the tenant-config schema
 * (and picks Memory as the config storage for this toy example). `logStore`
 * is optional (default = persistent FileLogStore); tests inject in-memory.
 */
export function makeExample(hubIssuer: string, logStore?: LogStore) {
    const store = new NotesStore();
    const provider = createProvider({
        config: { providerId: "notes-provider", allowlist: [{ iss: hubIssuer, role: "control-plane" }] },
        hooks:        makeHooks(store),
        domain:       makeDomain(store),
        tenantConfig: { ...NOTES_TENANT_CONFIG, store: new MemoryTenantConfigStore() },
        ...(logStore ? { store: logStore } : {}),
    });
    return { provider, store };
}
