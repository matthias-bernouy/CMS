import {
    HttpError,
    json,
    readJsonObject,
    requireCmsRequest,
    requireCmsWriteRequest,
    requiredQuery,
} from "../../http.ts";
import { validatedMondialRelayLabelUrl } from "../../provider/label-url.ts";
import { issueLabelCapability, shipmentForLabelCapability } from "../../shipment/label-access.ts";
import { requiredBodyText } from "../body.ts";

export async function label(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const token = requiredQuery(url, "token");
    const sellerCmsUserId = request.headers.get("x-cms-user-id")?.trim() || "";
    const row = await shipmentForLabelCapability(token, sellerCmsUserId);
    const labelUrl = typeof row?.label_url === "string" ? row.label_url : "";
    if (!labelUrl) {
        throw new HttpError(404, "label not found");
    }
    const providerUrl = validatedMondialRelayLabelUrl(labelUrl);
    const upstream = await fetch(providerUrl, { redirect: "manual" });
    if (upstream.status >= 300 && upstream.status < 400) {
        throw new HttpError(502, "Mondial Relay label redirects are not allowed");
    }
    if (!upstream.ok || !upstream.body) {
        throw new HttpError(502, "unable to fetch Mondial Relay label");
    }
    const contentType = (upstream.headers.get("content-type") ?? "").toLowerCase();
    if (!contentType.startsWith("application/pdf")) {
        throw new HttpError(502, "Mondial Relay label response is not a PDF");
    }
    return new Response(upstream.body, {
        status: 200,
        headers: {
            "content-type": "application/pdf",
            "cache-control": "private, no-store",
            "x-content-type-options": "nosniff",
            "content-disposition": `attachment; filename="mondial-relay-${String(row.expedition_number)}.pdf"`,
        },
    });
}

export async function issueLabelAccess(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const externalOrderId = requiredBodyText(body, "externalOrderId", 200);
    const sellerCmsUserId = requiredBodyText(body, "sellerCmsUserId", 200);
    return json(await issueLabelCapability(externalOrderId, sellerCmsUserId), 201);
}
