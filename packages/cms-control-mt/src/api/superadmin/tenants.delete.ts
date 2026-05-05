import type { MtControlCms } from "src/exports/MtControlCms";
import { assertValidTenantId } from "src/core/validation/tenant/id";

export default async function handleDeleteTenant(req: Request, mt: MtControlCms): Promise<Response> {
    const id = new URL(req.url).searchParams.get("id");
    try { assertValidTenantId(id); }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ ok: false, error: { code: "validation_error", message } }, { status: 400 });
    }

    const removed = await mt.removeTenant(id as string);
    if (!removed) {
        return Response.json({ ok: false, error: { code: "not_found", message: `tenant "${id}" not found` } }, { status: 404 });
    }
    return Response.json({ ok: true, data: { id } });
}
