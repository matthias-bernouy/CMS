import { ConfiguredSmtpEmailer } from "@bernouy/email-smtp/nodemailer";
import type { SmtpSendMailInput } from "@bernouy/email-smtp/nodemailer";
import { InMemorySecretStore } from "@bernouy/secret-store";
import { CmsSecrets } from "@bernouy/cms-secrets";
import { InMemoryCmsSecretMetadataStore } from "@bernouy/cms-secrets/memory";
import { registerOfficialFeatures } from "@bernouy/ulvia-provider/capabilities";
import { DefaultProviderCapabilityDispatcher } from "@bernouy/ulvia-provider";
import { createContractSecretStores } from "../../../../src/runtime/stores/secrets/contractSecretStores";
import { receiptFixture, scope } from "../fixture";
import { preparedEmailer } from "./releases";
import { smtpRequests } from "./requests";
import { emailerServer } from "./server";

export { message } from "./requests";
export const configuration = {
    enabled: true,
    fromEmail: "sender@example.test",
    fromName: "Sender",
    replyTo: "",
    smtp: { host: "smtp.example.test", port: 587, secure: false, username: "sender", password: "private-password" },
};

export async function runningEmailer(configured = true) {
    const receipt = receiptFixture();
    const sent: SmtpSendMailInput[] = [];
    const stores = await createContractSecretStores(
        new CmsSecrets(new InMemoryCmsSecretMetadataStore(), new InMemorySecretStore()),
        new InMemorySecretStore(),
    );
    const emailer = new ConfiguredSmtpEmailer({
        secrets: stores.smtpEmailer,
        transportFactory: async () => ({
            sendMail: async (input) => {
                sent.push(input);
            },
        }),
    });
    if (configured) {
        await emailer.updateConfiguration(configuration);
    }
    const { build, manifest, releases, buildVersion } = await preparedEmailer();
    const dispatcher = new DefaultProviderCapabilityDispatcher();
    await registerOfficialFeatures(dispatcher, { emailer }, releases, {
        ...scope,
        scope,
        executeKeyed: receipt.executor().execute,
    });
    const server = emailerServer(build.implementedContracts, dispatcher, manifest, buildVersion);
    return {
        ...server,
        receipt,
        sent,
        stores,
        releases,
        manifest,
        request: smtpRequests(server.origin, build.implementedContracts),
    };
}
