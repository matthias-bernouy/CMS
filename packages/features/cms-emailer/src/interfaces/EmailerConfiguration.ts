export type EmailerConfiguration = Readonly<{
    enabled: boolean;
    fromEmail: string;
    fromName: string;
    replyTo: string;
    transport: "smtp";
    smtp: Readonly<{
        host: string;
        port: number;
        secure: boolean;
        username: string;
        passwordConfigured: boolean;
    }>;
}>;

export type EmailerConfigurationUpdate = Readonly<{
    enabled: boolean;
    fromEmail: string;
    fromName: string;
    replyTo: string;
    transport: "smtp";
    smtp: Readonly<{
        host: string;
        port: number;
        secure: boolean;
        username: string;
        password?: string;
    }>;
}>;

export interface EmailerAdministration {
    getConfiguration(): Promise<EmailerConfiguration>;
    updateConfiguration(input: EmailerConfigurationUpdate): Promise<EmailerConfiguration>;
}
