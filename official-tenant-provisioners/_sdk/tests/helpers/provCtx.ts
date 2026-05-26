import { MemoryTenantRegistry } from "src/default-implementation/MemoryTenantRegistry";
import { MemoryAuditSink } from "src/default-implementation/MemoryAuditSink";
import type { ProviderHooks } from "src/interfaces/hooks";
import type { ProvisioningContext } from "src/types/ProvisioningContext";

export function makeCtx(hooks: Partial<ProviderHooks> = {}) {
    const registry = new MemoryTenantRegistry();
    const audit = new MemoryAuditSink();
    const invalidated: string[] = [];
    const calls = { provision: 0, update: 0, deprovision: [] as boolean[] };

    const full: ProviderHooks = {
        onProvision:   hooks.onProvision   ?? (async () => { calls.provision++; }),
        onUpdate:      hooks.onUpdate      ?? (async () => { calls.update++; }),
        onDeprovision: hooks.onDeprovision ?? (async (i) => { calls.deprovision.push(i.force); }),
    };
    const ctx: ProvisioningContext = {
        registry, hooks: full, audit,
        invalidate: (iss) => invalidated.push(iss),
        now: () => 1_700_000_000,
    };
    return { ctx, registry, audit, invalidated, calls };
}

export const HUB_ISS = "https://hub.example";
