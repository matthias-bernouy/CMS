import { publishSellerTermsAction } from "./seller-terms.ts";
import { HttpError, isRecord, json, readJsonObject, requireCmsRequest, type JsonRecord } from "../core/runtime.ts";
import { readSettings, settingsResult, updateSettings } from "./store.ts";
import { saveSettings } from "./settings.ts";
import { sourceHealth } from "./health.ts";
import { reconcile } from "./reconcile.ts";
import { localSimulation } from "./simulation.ts";
import { signingBindingsConfirmed } from "./webhooks/signingBindings.ts";
import destinations from "./webhooks/destinations.json" with { type: "json" };

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
        case "read-settings":
            return json(settingsResult(await readSettings()));
        case "save-settings":
            return json(await saveSettings(input));
        case "apply-settings":
            return json(await apply(owner, String(body.definitionVersion), secrets, generated));
        case "confirm-apply": {
            const current = await readSettings();
            if (current.saved_revision !== input.savedRevision || current.operation !== "pending_sync") {
                throw new HttpError(409, "Apply revision changed");
            }
            if (
                !localSimulation(secrets) &&
                !signingBindingsConfirmed(
                    current.resources,
                    generated,
                    destinations.destinations.map(({ name }) => name),
                )
            ) {
                throw new HttpError(
                    409,
                    "Signing secrets were not stored for the applied destinations; recover the matching secrets before confirmation",
                );
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
async function apply(owner: string, version: string, secrets: JsonRecord, generated: JsonRecord) {
    const current = await readSettings();
    if (!current.saved_revision) {
        throw new HttpError(422, "Save Connection settings first");
    }
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
            const next = await updateSettings(applying, { operation: "pending_sync", resources: result.resources });
            return { ...settingsResult(next), generatedSecrets: result.outputs };
        } catch (error) {
            await result.rollback();
            throw error;
        }
    } catch {
        await updateSettings(applying, { operation: "failed" });
        throw new HttpError(
            502,
            "Stripe configuration could not be applied. Check credentials and owned webhook state, then retry.",
        );
    }
}
