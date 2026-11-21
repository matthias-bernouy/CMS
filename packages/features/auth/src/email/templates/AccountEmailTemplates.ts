import type { z } from "@bernouy/ulvia-sdk";
import { hasActionLink } from "@bernouy/email-templates";
import type { AuthEmailComposer, AuthEmailComposeInput } from "auth/email/interfaces/AuthEmailComposer";
import { AccessError } from "auth/application/core/access/errors";
import type { AccountEmailConfigurationStore, AccountTemplateClient } from "./interfaces";
import { accountEmailConfigurationSchema, updateAccountEmailsSchema } from "./schemas";
import type { AccountEmailBinding } from "./schemas";

const variableKinds = new Map([
    ["siteName", "text"],
    ["recipientEmail", "text"],
    ["recipientName", "text"],
    ["actionUrl", "url"],
    ["expiresAt", "date-time"],
]);
export class AccountEmailTemplates implements AuthEmailComposer {
    constructor(
        private readonly store: AccountEmailConfigurationStore,
        private readonly client: AccountTemplateClient,
    ) {}
    async get() {
        const configuration = await this.store.read();
        if (!configuration) {
            throw new AccessError("CORE_UNAVAILABLE");
        }
        const stored = accountEmailConfigurationSchema.parse(configuration);
        let selectedSource: string | undefined;
        try {
            selectedSource = await this.client.source();
        } catch {
            // Reading stored associations remains possible while the selected service is unavailable.
        }
        return { ...stored, ...(selectedSource ? { selectedSource } : {}) };
    }
    async update(input: z.infer<typeof updateAccountEmailsSchema>) {
        input = updateAccountEmailsSchema.parse(input);
        const current = await this.get();
        if (current.revision !== input.expectedRevision) {
            if (
                current.revision === input.expectedRevision + 1 &&
                JSON.stringify(current.emailVerification) === JSON.stringify(input.emailVerification) &&
                JSON.stringify(current.passwordReset) === JSON.stringify(input.passwordReset)
            ) {
                return current;
            }
            throw new AccessError("REVISION_CONFLICT");
        }
        if (current.revision === Number.MAX_SAFE_INTEGER) {
            throw new AccessError("COUNTER_EXHAUSTED");
        }
        await this.validate(input.emailVerification, !sameBinding(input.emailVerification, current.emailVerification));
        await this.validate(input.passwordReset, !sameBinding(input.passwordReset, current.passwordReset));
        const next = {
            revision: current.revision + 1,
            emailVerification: input.emailVerification,
            passwordReset: input.passwordReset,
        };
        if (!(await this.store.replace(next, current.revision))) {
            throw new AccessError("REVISION_CONFLICT");
        }
        return next;
    }
    async compose(input: AuthEmailComposeInput) {
        const configuration = await this.get();
        const binding =
            input.kind === "email_verification" ? configuration.emailVerification : configuration.passwordReset;
        const content = await this.validate(binding, false);
        const values = new Map([
            ["siteName", input.siteName ?? "Ulvia"],
            ["recipientEmail", input.to.email],
            ["recipientName", input.to.displayName ?? ""],
            ["actionUrl", input.actionUrl],
            ["expiresAt", input.expiresAt.toISOString()],
        ]);
        const rendered = await this.client.render(
            binding,
            content.variables.map((variable) => ({ name: variable.name, value: values.get(variable.name)! })),
        );
        return { to: input.to, ...rendered };
    }
    private async validate(binding: AccountEmailBinding, newAssociation: boolean) {
        if (binding.source !== (await this.client.source())) {
            throw new AccessError("CORE_UNAVAILABLE");
        }
        const template = await this.client.describe(binding);
        if (
            (newAssociation && template.archived) ||
            template.content.variables.some((variable) => variableKinds.get(variable.name) !== variable.kind) ||
            !template.content.variables.some((variable) => variable.name === "actionUrl" && variable.required) ||
            !template.content.text.includes("{{actionUrl}}") ||
            (template.content.html && !hasActionLink(template.content.html, "actionUrl"))
        ) {
            throw new AccessError("INVALID_INPUT");
        }
        return template.content;
    }
}

function sameBinding(a: AccountEmailBinding, b: AccountEmailBinding) {
    return a.id === b.id && a.version === b.version && a.source === b.source;
}
