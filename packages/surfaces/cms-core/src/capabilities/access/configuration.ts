import { updateIdentityProvider, type IdentityProviderPatch } from "@bernouy/cms-auth/management";
import { CoreCapabilityDispatchError, type CoreCapabilityRegistry } from "../../dispatch/registry";
import type { CmsAccessDependencies } from "../../ports";
import {
    accessCommand,
    positiveRevision,
    projectIdentityProvider,
    projectSite,
    requiredText,
    revision,
} from "./support";

export function registerAccessConfigurationCapabilities(
    dispatcher: CoreCapabilityRegistry,
    core: CmsAccessDependencies,
): void {
    dispatcher.register("ulvia.cms.access", "update-login-provider", async (input) =>
        accessCommand(async () => {
            const patch = identityProviderPatch(input);
            if (Object.keys(patch).length === 0) {
                throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
            }
            const provider = await updateIdentityProvider(
                { identityProviders: core.identityProviders, users: core.users },
                requiredText(input.providerId),
                patch,
                positiveRevision(input.expectedRevision),
            );
            return projectIdentityProvider(provider);
        }),
    );
    dispatcher.register("ulvia.cms.access", "update-site", async (input) =>
        accessCommand(async () => {
            if (input.name === undefined && input.host === undefined && input.visible === undefined) {
                throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
            }
            const expectedRevision = revision(input.expectedRevision);
            const system = await core.repo.updateSystem(
                {
                    site: {
                        ...(input.name === undefined ? {} : { name: requiredText(input.name) }),
                        ...(input.host === undefined ? {} : { host: text(input.host) }),
                        ...(input.visible === undefined ? {} : { visible: boolean(input.visible) }),
                    },
                } as never,
                expectedRevision,
            );
            return projectSite(system, expectedRevision + 1);
        }),
    );
}

function identityProviderPatch(input: Record<string, unknown>): IdentityProviderPatch {
    const patch: IdentityProviderPatch = {};
    for (const key of ["displayName", "icon", "clientId"] as const) {
        if (input[key] !== undefined) {
            patch[key] = requiredText(input[key]);
        }
    }
    for (const key of ["issuer", "authorizationEndpoint", "tokenEndpoint", "jwksUri"] as const) {
        if (input[key] !== undefined) {
            patch[key] = secureUrl(input[key]);
        }
    }
    if (input.enabled !== undefined) {
        patch.enabled = boolean(input.enabled);
    }
    if (input.scopes !== undefined) {
        if (!Array.isArray(input.scopes)) {
            throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
        }
        patch.scopes = input.scopes.map(requiredText);
    }
    return patch;
}

function secureUrl(value: unknown): string {
    const candidate = requiredText(value);
    try {
        const url = new URL(candidate);
        if (url.protocol !== "https:" || url.username || url.password || url.hash) {
            throw new Error("unsafe URL");
        }
        return url.toString();
    } catch {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
}

function text(value: unknown): string {
    if (typeof value !== "string") {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}

function boolean(value: unknown): boolean {
    if (typeof value !== "boolean") {
        throw new CoreCapabilityDispatchError("INVALID_INPUT", 422);
    }
    return value;
}
