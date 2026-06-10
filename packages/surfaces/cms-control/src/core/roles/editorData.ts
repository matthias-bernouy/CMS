import type { ControlCms } from "cms-control/ControlCms";
import { ADMIN_ROLE, CMS_PERMISSION_CATALOGUE, cmsPermission } from "@bernouy/cms-permissions";
import type { GatewayRepository } from "@bernouy/cms-gateway";
import { parseUrn } from "@bernouy/cms-gateway";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

/** CMS capabilities of one feature, as pickable permissions. */
export type CmsPermGroup = { feature: string; label: string; permissions: { id: string; verb: string }[] };
/** Endpoints of one gateway provider, as pickable permissions. */
export type GatewayPermGroup = { provider: string; label: string; endpoints: { id: string; label: string }[] };

export type RoleEditorData = {
    role:    { id: string; label: string; builtin: boolean; grants: string[] };
    catalog: { cms: CmsPermGroup[]; gateway: GatewayPermGroup[] };
};

/**
 * Everything the grant editor needs for one role: its current grants (as a flat
 * permission-id list, for pre-checking) + the full available vocabulary — CMS
 * capabilities grouped by feature, and gateway endpoints grouped by provider
 * (labelled by the provider's display name). `admin` is the virtual super-role
 * and is not editable → rejected.
 */
export async function roleEditorData(cms: ControlCms, id: string): Promise<RoleEditorData> {
    if (id === ADMIN_ROLE) throw new InvalidParam("id", "the admin super-role is not editable");

    const def = await cms.roles.get(id);
    if (!def) throw new InvalidParam("id", "unknown role");

    const cmsGroups: CmsPermGroup[] = CMS_PERMISSION_CATALOGUE.map((f) => ({
        feature:     f.feature,
        label:       f.label,
        permissions: f.verbs.map((v) => ({ id: cmsPermission(f.feature, v), verb: v })),
    }));

    return {
        role:    { id: def.id, label: def.label, builtin: !!def.builtin, grants: def.grants.map((g) => g.permission) },
        catalog: { cms: cmsGroups, gateway: await gatewayPermGroups(cms) },
    };
}

/** Gateway endpoints grouped by provider, labelled by the provider's display
 *  name (fallback: its id, then its urn). Empty when no gateway is configured. */
async function gatewayPermGroups(cms: ControlCms): Promise<GatewayPermGroup[]> {
    let gateway: GatewayRepository | null = null;
    try { gateway = cms.gateway; } catch { gateway = null; }   // unconfigured → no gateway grants
    if (!gateway) return [];

    const providers = await gateway.getAllProviders();
    return providers.map((p) => ({
        provider:  p.urn,
        label:     p.meta?.name ?? parseUrn(p.urn)?.provider ?? p.urn,
        endpoints: p.endpoints.map((e) => ({ id: e.urn, label: e.meta?.name ?? e.urn })),
    }));
}
