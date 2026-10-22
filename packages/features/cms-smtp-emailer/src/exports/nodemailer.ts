export {
    ConfiguredSmtpEmailer,
    type ConfiguredSmtpEmailerConfig,
} from "cms-smtp-emailer/default-implementation/ConfiguredSmtpEmailer";
export {
    SmtpEmailer,
    type SmtpEmailerConfig,
    type SmtpSendMailInput,
    type SmtpTransport,
    type SmtpTransportConfig,
    type SmtpTransportFactory,
} from "cms-smtp-emailer/default-implementation/SmtpEmailer";
export type {
    SmtpEmailerAdministration,
    SmtpEmailerConfiguration,
    SmtpEmailerConfigurationUpdate,
} from "cms-smtp-emailer/interfaces/SmtpEmailerConfiguration";
export {
    SmtpEmailConfigurationError,
    type SmtpEmailConfigurationErrorCode,
} from "cms-smtp-emailer/core/SmtpEmailConfigurationError";
