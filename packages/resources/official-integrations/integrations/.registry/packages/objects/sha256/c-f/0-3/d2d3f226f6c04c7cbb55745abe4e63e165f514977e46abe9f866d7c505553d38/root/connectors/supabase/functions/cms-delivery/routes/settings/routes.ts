import { HttpError, json, queryText, readJsonObject, requireCmsRequest, requireCmsWriteRequest } from "../../http.ts";
import { settingsRow, upsertSettingsRow } from "../../shipment/supabase/index.ts";
import { settingsFromRow, settingsJson } from "./presentation.ts";
import { settingsRowFromBody } from "./update.ts";

export async function settings(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const url = new URL(request.url);
    const id = queryText(url, "id");
    const row = await settingsRow(id || "default");
    const settings = settingsJson(row);
    if (id) {
        return json(settings);
    }
    return json({ items: [settings] });
}

export async function setSettings(request: Request): Promise<Response> {
    requireCmsWriteRequest(request);
    const body = await readJsonObject(request);
    const patch = settingsRowFromBody(body);
    if (!Object.keys(patch).length) {
        throw new HttpError(400, "settings payload is empty");
    }
    const row = await upsertSettingsRow(patch);
    return json(settingsJson(row));
}
