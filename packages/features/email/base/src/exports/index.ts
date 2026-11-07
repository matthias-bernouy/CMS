export type { EmailRecipient, Emailer, OutboundEmail } from "email/interfaces/Emailer";
export { EmailDeliveryDisabledError, isEmailDeliveryDisabledError } from "email/core/EmailDeliveryError";
export { InMemoryEmailer } from "email/default-implementation/memory/InMemoryEmailer";
export { ConsoleEmailer } from "email/default-implementation/ConsoleEmailer";
