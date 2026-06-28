import type { ControlCms } from "cms-control/ControlCms";
import { ADMIN_ROLE, CMS_PERMISSION_CATALOGUE, cmsPermission } from "@bernouy/cms-permissions";
import type { SourceRepository } from "@bernouy/cms-sources";
import { isSystemSourceUrn, parseUrn } from "@bernouy/cms-sources";
import InvalidParam from "cms-control/errors/Http/InvalidParam";

/** CMS capabilities of one feature, as pickable permissions. */
export type CmsPermGroup = { feature: string; label: string; permissions: { id: string; verb: string }[] };
/** Endpoints of one source, as pickable permissions. */
export type SourcePermGroup = { provider: string; label: string; endpoints: { id: string; label: string }[] };

export type RoleEditorData = {
    role:    { id: string; label: string; builtin: boolean; grants: string[] };
    catalog: { cms: CmsPermGroup[]; gateway: SourcePermGroup[] };
};

/**
 * Everything the grant editor needs for one role: its current grants (as a flat
 * permission-id list, for pre-checking) + the full available vocabulary — CMS
 * capabilities grouped by feature, and source endpoints grouped by source
 * (labelled by the source display name). `admin` is the virtual super-role
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
        catalog: { cms: cmsGroups, gateway: await sourcePermGroups(cms) },
    };
}

/** Source endpoints grouped by source, labelled by the source display
 *  name (fallback: its id, then its urn). Empty when sources are not configured. */
async function sourcePermGroups(cms: ControlCms): Promise<SourcePermGroup[]> {
    let sources: SourceRepository | null = null;
    try { sources = cms.sources; } catch { sources = null; }
    if (!sources) return [];

    const providers = await sources.getAllSources();
    return providers.filter((p) => !isSystemSourceUrn(p.urn)).map((p) => ({
        provider:  p.urn,
        label:     p.meta?.name ?? parseUrn(p.urn)?.source ?? p.urn,
        endpoints: p.endpoints.map((e) => ({ id: e.urn, label: e.meta?.name ?? e.urn })),
    }));
}
