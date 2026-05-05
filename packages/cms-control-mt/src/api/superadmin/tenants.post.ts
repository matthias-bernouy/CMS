import type { MtControlCms } from "src/exports/MtControlCms";
import { parseTenantCreateDto } from "src/core/validation/tenant/parseCreateDto";

export default async function handleCreateTenant(req: Request, mt: MtControlCms): Promise<Response> {
    let body: Record<string, unknown>;
    try {
        body = (await req.json()) as Record<string, unknown>;
    } catch {
        return Response.json({ ok: false, error: { code: "validation_error", message: "invalid JSON body" } }, { status: 400 });
    }

    let dto;
    try { dto = parseTenantCreateDto(body); }
    catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        return Response.json({ ok: false, error: { code: "validation_error", message } }, { status: 400 });
    }

    try {
        const tenant = await mt.addTenant(dto);
        return Response.json({ ok: true, data: { id: tenant.id, name: tenant.name } }, { status: 201 });
    } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        const code = /duplicate key|already taken|already exists/i.test(message) ? "conflict" : "unknown";
        return Response.json({ ok: false, error: { code, message } }, { status: code === "conflict" ? 409 : 500 });
    }
}
