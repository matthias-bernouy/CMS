import { requireCmsWriteRequest } from "../core/auth.ts";
import { json, withMethod } from "../core/http.ts";
import { requiredPositiveInteger } from "../core/query.ts";
import { getOne, rest, restError } from "../core/rest.ts";

export async function deleteProductVariantAxis(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "DELETE", async () => {
        const id = requiredPositiveInteger(new URL(request.url).searchParams.get("id"), "id");
        const axis = await getOne("product_variant_axes", { id }, "id,product_id,attribute_id");
        if (axis) {
            await deleteRows(`product_variant_axis_options?product_id=eq.${axis.product_id}&attribute_id=eq.${axis.attribute_id}`);
            await deleteRows(`product_variant_axes?id=eq.${id}`);
        }
        return json({ ok: true, id: String(id) });
    });
}

export async function deleteById(request: Request, table: string): Promise<Response> {
    requireCmsWriteRequest(request);
    return await withMethod(request, "DELETE", async () => {
        const id = requiredPositiveInteger(new URL(request.url).searchParams.get("id"), "id");
        await deleteRows(`${table}?id=eq.${id}`);
        return json({ ok: true, id: String(id) });
    });
}

async function deleteRows(path: string): Promise<void> {
    const response = await rest(path, { method: "DELETE", headers: { prefer: "return=minimal" } });
    if (!response.ok) throw await restError(response);
}
