import { HttpError, isRecord, json, readJsonObject, requireCmsRequest } from "../../http.ts";
import { readSettings, settingsResult, updateSettings } from "./store.ts";
import { configured, saveSettings } from "./settings.ts";
import { sourceHealth, verifyTracking } from "./health.ts";

export async function manageSource(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const body = await readJsonObject(request);
    const input = isRecord(body.input) ? body.input : {};
    const secrets = isRecord(body.secretValues) ? body.secretValues : {};
    switch (body.operation) {
        case "health":
            return json(await sourceHealth(secrets));
        case "read-settings":
            return json(settingsResult(await readSettings()));
        case "save-settings":
            return json(await saveSettings(input));
        case "apply-settings": {
            const current = await readSettings();
            if (!current.saved_revision || !configured(current.values, secrets)) {
                throw new HttpError(422, "Complete Connection settings before applying");
            }
            let valid = false;
            try {
                valid = await verifyTracking(current.values, secrets);
            } catch {
                throw new HttpError(502, "Tracking credentials could not be checked");
            }
            if (!valid) {
                throw new HttpError(422, "Mondial Relay tracking credentials were rejected");
            }
            return json(settingsResult(await updateSettings(current, { operation: "pending_sync" })));
        }
        case "confirm-apply": {
            const current = await readSettings();
            if (current.saved_revision !== input.savedRevision || current.operation !== "pending_sync") {
                throw new HttpError(409, "Apply revision changed");
            }
            return json(
                settingsResult(
                    await updateSettings(current, { applied_revision: current.saved_revision, operation: "idle" }),
                ),
            );
        }
        default:
            throw new HttpError(400, "Unsupported management operation");
    }
}
