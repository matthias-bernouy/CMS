import { cmsUserId } from "../../../core/auth.ts";
import { json } from "../../../core/http.ts";
import { camelize, integer, readJsonObject } from "../../../core/records.ts";
import { rpc } from "../../../core/rest.ts";
import { protectedPolicyPayload } from "./fields.ts";
import { assertIntegerRanges } from "./validation.ts";

export async function createC2cPolicyRevision(request: Request): Promise<Response> {
    const body = await readJsonObject(request);
    const payload = protectedPolicyPayload(body);
    assertIntegerRanges(payload);
    const result = await rpc("create_c2c_policy_revision", {
        p_payload: payload,
        p_actor_id: cmsUserId(request),
        p_expected_settings_version: integer(body.expectedSettingsVersion, "expectedSettingsVersion", true),
    });
    return json(camelize(result), 201);
}
