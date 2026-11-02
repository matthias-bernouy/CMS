import { expect, test } from "bun:test";
import { documentationProcesses } from "./native";
import { connectBrowser } from "../oauth";
import { stage } from "./scenarios/client";
import { validationCollection } from "./scenarios/validation/collection";
import { validationPages } from "./scenarios/validation/pages";
import { incompatibleUpgrade } from "./scenarios/validation/upgrade";
import { editorWarnings } from "./scenarios/validation/editor";

const integration = process.env.ULVIA_RUN_DOCUMENTATION_NATIVE === "1" ? test : test.skip;

integration(
    "real MCP authoring diagnostics preserve state, rendered references and upgrade compatibility",
    async () => {
        const fixture = await documentationProcesses();
        let connection: Awaited<ReturnType<typeof connectBrowser>> | undefined;
        try {
            connection = await connectBrowser(fixture.cmsUrl, fixture.administrator, {
                executablePath: process.env.ULVIA_DOCUMENTATION_CHROMIUM,
            });
            const client = connection;
            const { source } = await stage(
                "Expanded example refusal → clone warning → stable digest → publication → installation",
                () => validationCollection(client),
            );
            await stage("Visual editor → successful save → persistent warning → clean stored Page", () =>
                editorWarnings(client, fixture.cmsUrl, fixture.administrator),
            );
            const page = await stage(
                "Template links → draft → refusal → publication → browser → ARIA → incoming dependencies",
                () => validationPages(client, fixture.cmsUrl),
            );
            await stage(
                "Valid collection release → incompatible expanded Page → blocked upgrade without mutation",
                () => incompatibleUpgrade(client, source, page.id),
            );
            await fixture.restartProvider();
            const saved = await client.call("ulvia.cms.content", "pages.get", { id: page.id });
            expect(saved).toEqual(page);
            expect(saved).not.toHaveProperty("diagnostics");
            await client.revoke();
        } catch (error) {
            throw new Error(`${String(error)}\n${await fixture.diagnostics()}`, { cause: error });
        } finally {
            await connection?.browser.close();
            await fixture.close();
            expect(fixture.processOutcomes().filter((outcome) => outcome.nativeCrash)).toEqual([]);
        }
    },
    300_000,
);
