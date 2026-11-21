import type { TemplateContent, TemplateValues } from "@bernouy/email-templates";
import type { OutboundEmail } from "@bernouy/email";
import type { AccountEmailConfiguration, AccountEmailBinding } from "./schemas";

export interface AccountEmailConfigurationStore {
    read(): Promise<AccountEmailConfiguration | null>;
    initialize(value: AccountEmailConfiguration): Promise<void>;
    replace(value: AccountEmailConfiguration, expectedRevision: number): Promise<boolean>;
}
export interface AccountTemplateClient {
    source(): Promise<string>;
    describe(binding: AccountEmailBinding): Promise<{ archived: boolean; content: TemplateContent }>;
    render(binding: AccountEmailBinding, values: TemplateValues): Promise<Omit<OutboundEmail, "to">>;
}
