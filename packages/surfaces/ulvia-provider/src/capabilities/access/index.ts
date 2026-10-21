import { deleteUserCompletely } from "@bernouy/cms-auth/management";
import {
    capabilityResponse,
    ProviderCapabilityDispatchError,
    type ProviderCapabilityRegistry,
} from "../../dispatch/registry";
import type { CmsAccessDependencies, UlviaProviderGateway } from "../../ports";
import {
    accessCommand,
    actorSubject,
    administratorState,
    projectUser,
    requiredGateway,
    requiredText,
    revision,
} from "./support";

export function registerAccessCapabilities(
    dispatcher: ProviderCapabilityRegistry,
    dependencies: CmsAccessDependencies,
    gateway: UlviaProviderGateway | undefined,
): void {
    dispatcher.register("ulvia.cms.access", "resolve-actor", async (_input, context) => {
        const subject = await dependencies.authentication.resolveCredential(context.actorCredential);
        if (!subject) {
            return { state: "anonymous" };
        }
        const administrator = await administratorState(gateway, subject.identifier);
        return {
            state: "authenticated",
            subjectId: subject.identifier,
            administrator: administrator.enabled,
            authorizationRevision: administrator.revision,
        };
    });
    dispatcher.register("ulvia.cms.access", "login-password", async (input) => {
        const result = await dependencies.authentication.authenticate(
            typeof input.email === "string" ? input.email : undefined,
            typeof input.password === "string" ? input.password : undefined,
        );
        if (!result.ok) {
            throw new ProviderCapabilityDispatchError(
                result.error === "rate_limited" ? "RATE_LIMITED" : "INVALID_CREDENTIALS",
                result.error === "rate_limited" ? 429 : 401,
            );
        }
        const administrator = await administratorState(gateway, result.subject.identifier);
        return capabilityResponse(
            {
                subjectId: result.subject.identifier,
                administrator: administrator.enabled,
            },
            {
                type: "session",
                operation: "establish",
                token: result.session.token,
                expiresAt: result.session.expiresAt,
            },
        );
    });
    dispatcher.register("ulvia.cms.access", "logout", async () =>
        capabilityResponse({ cleared: true }, { type: "session", operation: "clear" }),
    );
    dispatcher.register("ulvia.cms.access", "signup", async (input) =>
        accountAction(async () => {
            await dependencies.accountLifecycle.signup({
                email: requiredText(input.email),
                password: requiredText(input.password),
            });
            return { accepted: true };
        }),
    );
    dispatcher.register("ulvia.cms.access", "request-email-verification", async (input) =>
        accountAction(() =>
            dependencies.accountLifecycle.requestEmailVerification({ email: requiredText(input.email) }),
        ),
    );
    dispatcher.register("ulvia.cms.access", "confirm-email-verification", async (input) =>
        accountAction(async () => {
            await dependencies.accountLifecycle.confirmEmailVerification({ token: requiredText(input.token) });
            return { confirmed: true };
        }),
    );
    dispatcher.register("ulvia.cms.access", "request-password-reset", async (input) =>
        accountAction(() => dependencies.accountLifecycle.requestPasswordReset({ email: requiredText(input.email) })),
    );
    dispatcher.register("ulvia.cms.access", "confirm-password-reset", async (input) =>
        accountAction(async () => {
            await dependencies.accountLifecycle.confirmPasswordReset({
                token: requiredText(input.token),
                password: requiredText(input.password),
            });
            return { confirmed: true };
        }),
    );
    dispatcher.register("ulvia.cms.access", "list-users", async (input) => {
        const page = await dependencies.users.list({
            ...(typeof input.search === "string" ? { search: input.search } : {}),
            pagination: {
                page: Number.isSafeInteger(input.page) ? Number(input.page) : 1,
                limit: Number.isSafeInteger(input.limit) ? Number(input.limit) : 50,
            },
        });
        const administrators = await Promise.all(page.users.map((user) => administratorState(gateway, user.sub)));
        return { ...page, users: page.users.map((user, index) => projectUser(user, administrators[index]!)) };
    });
    dispatcher.register("ulvia.cms.access", "get-user", async (input) => {
        const sub = requiredText(input.sub);
        const user = await dependencies.users.getBySub(sub);
        if (!user) {
            throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
        }
        return projectUser(user, await administratorState(gateway, sub));
    });
    dispatcher.register("ulvia.cms.access", "set-administrator", async (input, context) =>
        accessCommand(async () => {
            const active = requiredGateway(gateway);
            const sub = requiredText(input.sub);
            if (!(await dependencies.users.getBySub(sub))) {
                throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
            }
            const enabled = input.enabled === true;
            if (!enabled && (await actorSubject(active, context)) === sub) {
                throw new ProviderCapabilityDispatchError("CANNOT_REMOVE_SELF", 409);
            }
            const state = await active.administrators.set(sub, enabled, revision(input.expectedRevision));
            return {
                sub,
                administrator: state.enabled,
                revision: state.revision,
                bootstrap: state.bootstrap,
            };
        }),
    );
    dispatcher.register("ulvia.cms.access", "delete-user", async (input, context) =>
        accessCommand(async () => {
            const active = requiredGateway(gateway);
            const sub = requiredText(input.sub);
            if ((await actorSubject(active, context)) === sub) {
                throw new ProviderCapabilityDispatchError("CANNOT_REMOVE_SELF", 409);
            }
            if (!(await active.administrators.canRevoke(sub))) {
                throw new ProviderCapabilityDispatchError("PROTECTED_USER", 409);
            }
            const user = await dependencies.users.getBySub(sub);
            if (!user) {
                throw new ProviderCapabilityDispatchError("NOT_FOUND", 404);
            }
            await deleteUserCompletely(
                {
                    users: dependencies.users,
                    credentials: dependencies.credentials,
                    pats: dependencies.pats,
                    beforeMembershipDelete: async () => {
                        const state = await active.administrators.get(sub);
                        if (state.enabled) {
                            await active.administrators.set(sub, false, state.revision);
                        }
                    },
                },
                user,
            );
            return { sub, deleted: true };
        }),
    );
}

async function accountAction<T>(action: () => Promise<T>): Promise<T> {
    try {
        return await action();
    } catch (error) {
        if (error instanceof ProviderCapabilityDispatchError) {
            throw error;
        }
        if (error && typeof error === "object" && "status" in error && Number(error.status) === 400) {
            throw new ProviderCapabilityDispatchError("INVALID_INPUT", 422);
        }
        throw error;
    }
}
