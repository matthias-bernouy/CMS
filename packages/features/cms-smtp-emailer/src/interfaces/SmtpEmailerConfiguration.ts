export type SmtpEmailerConfiguration = Readonly<{
    enabled: boolean;
    fromEmail: string;
    fromName: string;
    replyTo: string;
    smtp: Readonly<{
        host: string;
        port: number;
        secure: boolean;
        username: string;
        passwordConfigured: boolean;
    }>;
}>;

export type SmtpEmailerConfigurationUpdate = Readonly<{
    enabled: boolean;
    fromEmail: string;
    fromName: string;
    replyTo: string;
    smtp: Readonly<{
        host: string;
        port: number;
        secure: boolean;
        username: string;
        password?: string;
    }>;
}>;

export interface SmtpEmailerAdministration {
    getConfiguration(): Promise<SmtpEmailerConfiguration>;
    updateConfiguration(input: SmtpEmailerConfigurationUpdate): Promise<SmtpEmailerConfiguration>;
}
