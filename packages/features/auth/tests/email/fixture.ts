import { renderContent } from "@bernouy/email-templates";
import { accountTemplateSeeds } from "@bernouy/auth/email-templates";
import type { AuthEmailComposer } from "@bernouy/auth";

/** Unrelated unit flows use the real pure renderer with explicit test composition. */
export const testAccountComposer: AuthEmailComposer = {
    compose: async (input) => {
        const seed = accountTemplateSeeds[input.kind === "email_verification" ? 0 : 1]!;
        return {
            to: input.to,
            ...renderContent(seed.draft, [
                { name: "siteName", value: input.siteName ?? "Test site" },
                { name: "recipientEmail", value: input.to.email },
                { name: "recipientName", value: input.to.displayName ?? "" },
                { name: "actionUrl", value: input.actionUrl },
                { name: "expiresAt", value: input.expiresAt.toISOString() },
            ]),
        };
    },
};
