export type { EmailRecipient, Emailer, OutboundEmail } from "cms-emailer/interfaces/Emailer";
export type {
    EmailerAdministration,
    EmailerConfiguration,
    EmailerConfigurationUpdate,
} from "cms-emailer/interfaces/EmailerConfiguration";
export {
    EmailConfigurationError,
    isEmailDeliveryDisabledError,
    type EmailConfigurationErrorCode,
} from "cms-emailer/core/EmailConfigurationError";
export { InMemoryEmailer } from "cms-emailer/default-implementation/memory/InMemoryEmailer";
export { ConsoleEmailer } from "cms-emailer/default-implementation/ConsoleEmailer";
