import { updateAccountRow } from "../../db/repositories/accounts.ts";
import { publicAccountStatus } from "../../domain/accounts/presentation.ts";
import { requireCmsRequest } from "../../http/auth.ts";
import { readJsonObject, requiredString } from "../../http/body.ts";
import { requiredQueryText, validHttpsUrl } from "../../http/query.ts";
import { json } from "../../http/responses.ts";
import { createAccountLink, createAccountSession } from "../../provider/accounts/onboarding.ts";
import { stringAt, unixTimestampAt } from "../../shared/data.ts";
import type { JsonRecord } from "../../shared/types.ts";
import { ensureConnectedAccountForUser } from "./lifecycle.ts";

export async function connectOnboarding(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const body = await readJsonObject(request);
    return json(await createOnboardingForUser(userId, body));
}

export async function connectOnboardingSession(request: Request): Promise<Response> {
    const { userId } = requireCmsRequest(request);
    const body = await readJsonObject(request);
    return json(await createOnboardingSessionForUser(userId, body));
}

export async function adminCreateOnboarding(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const userId = requiredQueryText(request, "userId", 200);
    const body = await readJsonObject(request);
    return json(await createOnboardingForUser(userId, body));
}

export async function adminCreateOnboardingSession(request: Request): Promise<Response> {
    requireCmsRequest(request, { requireUser: false });
    const userId = requiredQueryText(request, "userId", 200);
    const body = await readJsonObject(request);
    return json(await createOnboardingSessionForUser(userId, body));
}

async function createOnboardingForUser(userId: string, body: JsonRecord): Promise<JsonRecord> {
    const returnUrl = validHttpsUrl(requiredString(body, "returnUrl", 2048), "returnUrl");
    const refreshUrl = validHttpsUrl(requiredString(body, "refreshUrl", 2048), "refreshUrl");
    const { account, stripeAccountId, stripeAccountApiVersion } = await ensureConnectedAccountForUser(userId, body);
    const link = await createAccountLink(stripeAccountId, stripeAccountApiVersion, returnUrl, refreshUrl);
    const updated =
        (await updateAccountRow(userId, {
            onboarding_status: "link_created",
            last_onboarding_started_at: new Date().toISOString(),
        })) ?? account;

    return {
        ...publicAccountStatus(updated, userId),
        url: stringAt(link, "url"),
        expiresAt: unixTimestampAt(link, "expires_at"),
    };
}

async function createOnboardingSessionForUser(userId: string, body: JsonRecord): Promise<JsonRecord> {
    const { account, stripeAccountId } = await ensureConnectedAccountForUser(userId, body);
    const session = await createAccountSession(stripeAccountId);
    const updated =
        (await updateAccountRow(userId, {
            onboarding_status: "onboarding_started",
            last_onboarding_started_at: new Date().toISOString(),
        })) ?? account;

    return {
        ...publicAccountStatus(updated, userId),
        clientSecret: session.client_secret,
        expiresAt: session.expires_at,
    };
}
