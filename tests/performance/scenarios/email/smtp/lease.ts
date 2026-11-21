import { assertSmtpConfiguration } from "./configuration";
import { assertCondition } from "../../queries/types";
import type { settingsTenants } from "../../content/settings/tenant";
import type { QueryEnvironment } from "../../queries/execute";

/** Every active sample owns its settings revision and SMTP configuration through an existing bounded tenant lease. */
export async function smtpLease(
    lease: Awaited<ReturnType<ReturnType<typeof settingsTenants>>>,
    environment: QueryEnvironment,
) {
    const service = environment.stack.smtp;
    let disable: (() => Promise<void>) | undefined;
    try {
        assertCondition(service);
        const input = {
            enabled: true,
            fromEmail: "sender@performance.test",
            fromName: "Performance sender",
            replyTo: "reply@performance.test",
            smtp: service.connection,
        };
        const configure = async (enabled: boolean) => {
            const value = { ...input, enabled };
            const result = await lease.value.client(
                "ulvia/cms.emailer.smtp",
                "smtp.configuration.update",
                "http",
                value,
                (output) => assertSmtpConfiguration(output, value),
            );
            assertCondition(result.observation.validated);
        };
        disable = () => configure(false);
        await configure(true);
        return {
            ...lease.value,
            service,
            configure,
            async close() {
                try {
                    await configure(false);
                } finally {
                    lease.release();
                }
            },
        };
    } catch (error) {
        try {
            await disable?.();
        } finally {
            lease.release();
        }
        throw error;
    }
}

export type SmtpLease = Awaited<ReturnType<typeof smtpLease>>;
