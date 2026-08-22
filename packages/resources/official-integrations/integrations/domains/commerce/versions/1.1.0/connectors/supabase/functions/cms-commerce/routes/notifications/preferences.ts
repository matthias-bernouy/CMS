import { cmsUserId } from "../../core/auth.ts";
import { HttpError } from "../../core/errors.ts";
import { json } from "../../core/http.ts";
import { isRecord, readJsonObject } from "../../core/records.ts";
import { rest, restJson } from "../../core/rest.ts";
import type { JsonRecord } from "../../core/types.ts";
import { boundedText } from "./values.ts";

type RuleRow = {
    key: string;
    label: string;
    description: string;
    policy: "required" | "default_on" | "opt_in";
};

export async function notificationPreferences(request: Request): Promise<Response> {
    if (request.method === "GET") {
        return await getPreferences(request);
    }
    if (request.method === "POST") {
        return await updatePreferences(request);
    }
    throw new HttpError(405, "method not allowed");
}

async function getPreferences(request: Request): Promise<Response> {
    const userId = boundedText(cmsUserId(request), "CMS user id", 512);
    const [rules, preferences] = await Promise.all([
        restJson<RuleRow[]>("notification_rules?select=key,label,description,policy&enabled=eq.true&order=created_at"),
        restJson<JsonRecord[]>(
            `notification_user_preferences?select=rule_key,enabled&cms_user_id=eq.${encodeURIComponent(userId)}`,
        ),
    ]);
    const selected = new Map(preferences.map((item) => [String(item.rule_key), item.enabled === true]));
    return json({
        items: rules.map((rule) => ({
            key: rule.key,
            label: rule.label,
            description: rule.description,
            policy: rule.policy,
            configurable: rule.policy !== "required",
            enabled: rule.policy === "required" ? true : (selected.get(rule.key) ?? rule.policy === "default_on"),
        })),
    });
}

async function updatePreferences(request: Request): Promise<Response> {
    const userId = boundedText(cmsUserId(request), "CMS user id", 512);
    const body = await readJsonObject(request);
    if (!Array.isArray(body.preferences) || body.preferences.length > 100) {
        throw new HttpError(400, "preferences must be an array of at most 100 items");
    }
    const rules = new Map(
        (
            await restJson<Array<{ key: string; policy: string }>>(
                "notification_rules?select=key,policy&enabled=eq.true",
            )
        ).map((item) => [item.key, item.policy]),
    );
    const payload: JsonRecord[] = [];
    for (const raw of body.preferences) {
        if (!isRecord(raw)) {
            throw new HttpError(400, "preference item must be an object");
        }
        const key = boundedText(raw.key, "preference.key", 140);
        const policy = rules.get(key);
        if (!policy) {
            throw new HttpError(400, `unknown notification preference: ${key}`);
        }
        if (policy === "required") {
            throw new HttpError(400, `required notification cannot be disabled: ${key}`);
        }
        if (typeof raw.enabled !== "boolean") {
            throw new HttpError(400, `preference.enabled must be boolean: ${key}`);
        }
        payload.push({
            cms_user_id: userId,
            rule_key: key,
            enabled: raw.enabled,
            updated_at: new Date().toISOString(),
        });
    }
    if (payload.length) {
        await rest("notification_user_preferences?on_conflict=cms_user_id,rule_key", {
            method: "POST",
            headers: { prefer: "resolution=merge-duplicates" },
            body: JSON.stringify(payload),
        });
    }
    return await getPreferences(request);
}
