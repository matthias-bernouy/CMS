import { capabilitiesFor } from "@bernouy/ulvia-sdk";
import type { SmtpEmailerServices } from "email-smtp/interfaces/SmtpEmailerServices";

export const defineCapability = capabilitiesFor<SmtpEmailerServices>();
