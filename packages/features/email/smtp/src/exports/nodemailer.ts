export {
    ConfiguredSmtpEmailer,
    type ConfiguredSmtpEmailerConfig,
} from "email-smtp/default-implementation/ConfiguredSmtpEmailer";
export {
    SmtpEmailer,
    type SmtpEmailerConfig,
    type SmtpSendMailInput,
    type SmtpTransport,
    type SmtpTransportConfig,
    type SmtpTransportFactory,
} from "email-smtp/default-implementation/SmtpEmailer";
export type {
    SmtpEmailerAdministration,
    SmtpEmailerConfiguration,
    SmtpEmailerConfigurationUpdate,
} from "email-smtp/interfaces/SmtpEmailerConfiguration";
export {
    SmtpEmailConfigurationError,
    type SmtpEmailConfigurationErrorCode,
} from "email-smtp/core/SmtpEmailConfigurationError";
