import { publishMarketplaceTermsManagement } from "../core/management.ts";
import { HttpError, isRecord, json, type JsonRecord } from "../core/runtime.ts";

export async function publishSellerTermsAction(request: Request, body: JsonRecord): Promise<Response> {
    const input = isRecord(body.input) ? body.input : {};
    const pages = isRecord(body.resolvedPages) ? body.resolvedPages : {};
    const selected = pages.page;
    if (!isRecord(selected) || selected.path !== input.page || typeof selected.publishedSnapshotUrl !== "string") {
        throw new HttpError(422, "Select a published CMS page for seller terms");
    }
    const response = await publishMarketplaceTermsManagement(
        new Request(request.url, {
            method: "POST",
            headers: request.headers,
            body: JSON.stringify({
                expectedVersion: input.expectedVersion,
                documentKey: input.documentKey,
                label: input.label,
                consentText: input.consentText,
                publishedSnapshotUrl: selected.publishedSnapshotUrl,
            }),
        }),
    );
    if (!response.ok) {
        return response;
    }
    return json({ values: await response.json() });
}
