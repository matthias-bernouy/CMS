import type { z } from "@bernouy/ulvia-sdk";
import type {
    smtpConfigurationSchema,
    smtpConfigurationUpdateSchema,
    storedSmtpConfigurationSchema,
} from "email-smtp/schemas/configuration";

type Immutable<Value> = Value extends object ? { readonly [Key in keyof Value]: Immutable<Value[Key]> } : Value;

export type SmtpEmailerConfiguration = Immutable<z.output<typeof smtpConfigurationSchema>>;
export type SmtpEmailerConfigurationUpdate = Immutable<z.input<typeof smtpConfigurationUpdateSchema>>;
export type StoredConfiguration = z.output<typeof storedSmtpConfigurationSchema>;

export interface SmtpEmailerAdministration {
    getConfiguration(): Promise<SmtpEmailerConfiguration>;
    updateConfiguration(input: SmtpEmailerConfigurationUpdate): Promise<SmtpEmailerConfiguration>;
}
