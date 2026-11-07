import type { EmailerServices } from "@bernouy/email/feature";
import type { SmtpEmailerAdministration } from "email-smtp/interfaces/SmtpEmailerConfiguration";

export interface SmtpEmailerServices extends EmailerServices {
    readonly emailer: EmailerServices["emailer"] & SmtpEmailerAdministration;
}
