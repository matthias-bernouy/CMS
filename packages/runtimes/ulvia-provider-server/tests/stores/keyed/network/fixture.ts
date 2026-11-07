import { ConfiguredSmtpEmailer } from "@bernouy/email-smtp/nodemailer";
import type { SmtpSendMailInput } from "@bernouy/email-smtp/nodemailer";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { compileEmailReleases } from "@bernouy/ulvia-provider/build";
import { registerSmtpEmailerCapabilities } from "@bernouy/ulvia-provider/capabilities";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { createProviderHandler } from "@bernouy/cms-gateway/provider/server";
import { signProviderInvocationToken, verifyProviderInvocationToken } from "@bernouy/cms-gateway/protocol";
import type { ProviderInvocationClaims } from "@bernouy/cms-gateway/protocol";
import { receiptFixture, scope } from "../fixture";

const TOKEN = "test-only-smtp-provider-token-" + "x".repeat(40);
export const message = { toEmail: "member@example.test", subject: "Welcome", text: "Hello" };

export async function runningEmailer() {
    const receipt = receiptFixture();
    const sent: SmtpSendMailInput[] = [];
    const emailer = new ConfiguredSmtpEmailer({
        secrets: new InMemorySecretStore(),
        transportFactory: async () => ({
            sendMail: async (input) => {
                sent.push(input);
            },
        }),
    });
    await emailer.updateConfiguration({
        enabled: true,
        fromEmail: "sender@example.test",
        fromName: "Sender",
        replyTo: "",
        smtp: { host: "smtp.example.test", port: 587, secure: false, username: "sender", password: "private-password" },
    });
    const build = await compileEmailReleases();
    const dispatcher = new DefaultProviderCapabilityDispatcher(build.implementedContracts);
    await registerSmtpEmailerCapabilities(
        dispatcher,
        { emailer },
        { ...scope, scope, executeKeyed: receipt.executor().execute },
    );
    const counts = { authenticate: 0, authorize: 0 };
    let allowed = true;
    const receive = createProviderHandler({
        contracts: build.implementedContracts,
        dispatcher,
        authenticate: async (request) => {
            counts.authenticate++;
            const authorization = request.headers.get("authorization");
            if (!authorization?.startsWith("Bearer ")) {
                return null;
            }
            try {
                const claims = verifyProviderInvocationToken(authorization.slice(7), TOKEN);
                return claims.instanceId === scope.instanceId
                    ? { claims, siteId: scope.siteId, providerId: scope.providerId }
                    : null;
            } catch {
                return null;
            }
        },
        authorize: async () => {
            counts.authorize++;
            return allowed;
        },
    });
    const server = Bun.serve({ hostname: "127.0.0.1", port: 0, fetch: receive });
    const origin = server.url.origin;
    return {
        receipt,
        sent,
        counts,
        deny: () => {
            allowed = false;
        },
        close: () => server.stop(true),
        request: (
            input: unknown = message,
            options: { key?: string | null; claims?: Partial<ProviderInvocationClaims>; authenticated?: boolean } = {},
        ) => {
            const claims: ProviderInvocationClaims = {
                version: 1,
                requestId: crypto.randomUUID(),
                instanceId: scope.instanceId,
                contractId: "ulvia/cms.emailer.smtp",
                contractVersion: "1.0.0",
                capabilityId: "emailer.send",
                actorKind: "administrator",
                subjectId: "admin-a",
                issuedAt: Math.floor(Date.now() / 1000),
                expiresAt: Math.floor(Date.now() / 1000) + 30,
                ...options.claims,
            };
            return new Request(`${origin}/send`, {
                method: "POST",
                headers: {
                    "content-type": "application/json",
                    "x-ulvia-request-id": claims.requestId,
                    ...(options.key === null ? {} : { "idempotency-key": options.key ?? "send-1" }),
                    ...(options.authenticated === false
                        ? {}
                        : { authorization: `Bearer ${signProviderInvocationToken(TOKEN, claims)}` }),
                },
                body: JSON.stringify(input),
            });
        },
    };
}
