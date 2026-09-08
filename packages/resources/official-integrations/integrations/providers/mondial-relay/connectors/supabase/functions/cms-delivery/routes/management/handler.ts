import { HttpError, isRecord, json, readJsonObject, requireCmsRequest } from "../../http.ts";
import { readSettings, settingsResult, updateSettings } from "./store.ts";
import { configured, connectionValues } from "./settings.ts";
import { sourceHealth, verifyTracking } from "./health.ts";

export async function manageSource(request: Request): Promise<Response> {
    requireCmsRequest(request);
    const body = await readJsonObject(request);
    const input = isRecord(body.input) ? body.input : {};
    const secrets = isRecord(body.secretValues) ? body.secretValues : {};
    const verifyConnection = async (values: Record<string, unknown>) => {
        if (!configured(values, secrets)) {
            throw new HttpError(422, "Complete Connection settings before applying");
        }
        let valid = false;
        try {
            valid = await verifyTracking(values, secrets);
        } catch {
            throw new HttpError(502, "Tracking credentials could not be checked");
        }
        if (!valid) {
            throw new HttpError(422, "Mondial Relay tracking credentials were rejected");
        }
    };
    switch (body.operation) {
        case "health":
            return json(await sourceHealth(secrets));
        case "read-connection":
            return json(settingsResult(await readSettings()));
        case "save-connection": {
            const current = await readSettings();
            if (current.operation === "applying" || input.expectedRevision !== current.saved_revision) {
                throw new HttpError(409, "Connection revision changed or configuration is running");
            }
            const values = connectionValues(input);
            await verifyConnection(values);
            const revision = crypto.randomUUID();
            return json(
                settingsResult(
                    await updateSettings(current, {
                        values,
                        saved_revision: revision,
                        applied_revision: revision,
                        operation: "idle",
                    }),
                ),
            );
        }
        case "retry-connection": {
            const current = await readSettings();
            if (!current.saved_revision || current.saved_revision !== input.expectedRevision) {
                throw new HttpError(409, "Connection revision changed");
            }
            await verifyConnection(current.values);
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
