import type { MtControlCms } from "src/exports/MtControlCms";

export default async function handleListTenants(_req: Request, mt: MtControlCms): Promise<Response> {
    const tenants = await mt.tenantRepo.list();
    // Strip secrets — superadmin UI doesn't need them re-shown after creation.
    const safe = tenants.map(t => ({
        id:        t.id,
        name:      t.name,
        createdAt: t.createdAt,
        updatedAt: t.updatedAt,
        keycloak: {
            issuer:    t.keycloak.issuer,
            clientId:  t.keycloak.clientId,
            adminRole: t.keycloak.adminRole,
        },
        assetsCdn: { url: t.assetsCdn.url },
        // Public-safe view of delivery — never exposes the bucketCredential.
        delivery: t.delivery
            ? {
                publicCdn: { url: t.delivery.publicCdn.url },
                ...(t.delivery.alias   ? { alias:   t.delivery.alias   } : {}),
                enabled: !!t.delivery.enabled,
                hasCredential: true,
            }
            : null,
    }));
    return Response.json({ ok: true, data: safe });
}
