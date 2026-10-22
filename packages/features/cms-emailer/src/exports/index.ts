export type { EmailRecipient, Emailer, OutboundEmail } from "cms-emailer/interfaces/Emailer";
export {
    EmailDeliveryDisabledError,
    isEmailDeliveryDisabledError,
} from "cms-emailer/core/EmailDeliveryError";
export { InMemoryEmailer } from "cms-emailer/default-implementation/memory/InMemoryEmailer";
export { ConsoleEmailer } from "cms-emailer/default-implementation/ConsoleEmailer";
