import { publishSellerTermsAction } from "./seller-terms.ts";
import { HttpError, isRecord, json, readJsonObject, requireCmsRequest, type JsonRecord } from "../core/runtime.ts";
import { readSettings, settingsResult, updateSettings, type Settings } from "./store.ts";
import { connectionValues, validateCredentials } from "./settings.ts";
import { sourceHealth } from "./health.ts";
import { reconcile } from "./reconcile.ts";

export async function manageSource(request: Request): Promise<Response> {
    requireCmsRequest(request, false);
    const body = await readJsonObject(request);
    const input = isRecord(body.input) ? body.input : {};
    const secrets = isRecord(body.secretValues) ? body.secretValues : {};
    const generated = isRecord(body.generatedSecretValues) ? body.generatedSecretValues : {};
    const owner = typeof body.installationId === "string" && body.installationId ? "stripe-connect" : "";
    if (!owner) {
        throw new HttpError(422, "Installation context is required");
    }
    if (body.operation === "action" && body.actionId === "publish-seller-terms") {
        return publishSellerTermsAction(request, body);
    }
    switch (body.operation) {
        case "health":
            return json(await sourceHealth(owner, secrets, generated));
        case "read-connection":
            return json(settingsResult(await readSettings()));
        case "save-connection": {
            const current = await readSettings();
            if (input.expectedRevision !== current.saved_revision) {
                throw new HttpError(409, "Settings revision changed");
            }
            const values = connectionValues(input);
            validateCredentials(secrets);
            return json(
                await apply(
                    owner,
                    String(body.definitionVersion),
                    secrets,
                    generated,
                    current,
                    values,
                    crypto.randomUUID(),
                ),
            );
        }
        case "retry-connection": {
            const current = await readSettings();
            if (!current.saved_revision || input.expectedRevision !== current.saved_revision) {
                throw new HttpError(409, "Connection revision changed");
            }
            validateCredentials(secrets);
            return json(
                await apply(
                    owner,
                    String(body.definitionVersion),
                    secrets,
                    generated,
                    current,
                    current.values,
                    current.saved_revision,
                ),
            );
        }
        default:
            throw new HttpError(400, "Unsupported management operation");
    }
}
async function apply(
    owner: string,
    version: string,
    secrets: JsonRecord,
    generated: JsonRecord,
    current: Settings,
    values: JsonRecord,
    revision: string,
) {
    if (current.operation === "applying" && Date.now() - Date.parse(current.operation_started_at ?? "") < 300000) {
        throw new HttpError(409, "Settings are already applying");
    }
    const applying = await updateSettings(current, {
        operation: "applying",
        operation_id: crypto.randomUUID(),
        operation_started_at: new Date().toISOString(),
    });
    try {
        const result = await reconcile(
            owner,
            version,
            secrets,
            generated,
            applying.operation_id ?? undefined,
            applying.resources,
        );
        try {
            const next = await updateSettings(applying, {
                values,
                saved_revision: revision,
                applied_revision: revision,
                operation: "idle",
                operation_id: null,
                operation_started_at: null,
                resources: result.resources,
            });
            return { ...settingsResult(next), generatedSecrets: result.outputs };
        } catch (error) {
            await result.rollback();
            throw error;
        }
    } catch {
        await updateSettings(applying, { operation: "failed", operation_started_at: null });
        throw new HttpError(
            502,
            "Stripe configuration could not be applied. Check credentials and owned webhook state, then retry.",
        );
    }
}
