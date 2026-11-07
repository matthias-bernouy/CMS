import { capabilitiesFor, capabilityResponse, contractString, defineFeature, z } from "@bernouy/ulvia-sdk";
export const context = { requestId: "local", contractVersion: "1.0.0", siteId: "site", providerId: "example/provider" };
export const session = { token: "private-session-token", expiresAt: "2030-01-01T00:00:00.000Z" };
interface Services {
    sessions: { issue(): Promise<typeof session>; revoke(): Promise<void> };
}
export const author = capabilitiesFor<Services>();
// An ephemeral fixture for the protocol-reserved Access effect; never published.
export function definitions(declared = true) {
    const login = author({
        id: "login",
        access: "public",
        behavior: { effect: "command", execution: "sync", idempotency: "none", sensitive: true },
        input: z.strictObject({}),
        output: z.strictObject({ subjectId: contractString({ maxLength: 128 }) }),
        errors: {},
        ...(declared ? { responseEffects: ["session"] as const } : {}),
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "POST",
                path: "/login",
                response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
            },
        ],
        execute: async ({ services }) =>
            capabilityResponse(
                { subjectId: "subject-a" },
                { type: "session", operation: "establish", ...(await services.sessions.issue()) },
            ),
    });
    const logout = author({
        id: "logout",
        access: "public",
        behavior: { effect: "command", execution: "sync", idempotency: "natural", sensitive: true },
        input: z.strictObject({}),
        output: z.strictObject({ cleared: z.boolean() }),
        errors: {},
        responseEffects: ["session"],
        bindings: [
            {
                id: "http",
                transport: "http",
                method: "POST",
                path: "/logout",
                response: { successStatuses: [200], contentTypes: ["application/json"], errorStatuses: {} },
            },
        ],
        execute: async ({ services }) => {
            await services.sessions.revoke();
            return capabilityResponse({ cleared: true }, { type: "session", operation: "clear" });
        },
    });
    const feature = defineFeature({
        contractId: "ulvia/cms.access",
        name: "Sessions",
        publisherId: "ulvia",
        version: "1.0.0",
        capabilities: [login, logout],
    });
    return { feature, login, logout };
}
export function services() {
    const counts = { issues: 0, revokes: 0 };
    return {
        counts,
        ports: {
            sessions: {
                issue: async () => {
                    counts.issues++;
                    return session;
                },
                revoke: async () => {
                    counts.revokes++;
                },
            },
        },
    };
}
