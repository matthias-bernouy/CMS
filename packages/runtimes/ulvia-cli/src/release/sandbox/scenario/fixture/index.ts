import type { VerificationQueryParameter, VerificationQueryRow } from "@bernouy/cms-integration-verification/sdk/v1";
import type {
    UpgradeFixtureContextV1,
    UpgradeFixtureJsonRequestV1,
} from "@bernouy/cms-integration-verification/upgrade-fixtures/v1";
import { BunLocalSupabaseDatabase } from "../../../../runtime/supabase-local/database";
import type { LocalSupabaseEnvironment } from "../../../../runtime/supabase";
import { ReleaseSandboxClient } from "../../client";
import { fixtureHttpResponse, jsonRequestInit } from "./http";
import { createSupabaseFixtureServices } from "./services";

export type UpgradeFixtureHarness = Readonly<{
    context(stage: UpgradeFixtureContextV1["stage"]): UpgradeFixtureContextV1;
    close(): Promise<void>;
}>;

export function createUpgradeFixtureHarness(
    input: Readonly<{
        kind: string;
        baselineVersion: string;
        targetVersion: string;
        client: () => ReleaseSandboxClient;
        supabase: LocalSupabaseEnvironment;
    }>,
): UpgradeFixtureHarness {
    const database = new BunLocalSupabaseDatabase(input.supabase.databaseUrl);
    const services = createSupabaseFixtureServices(input.supabase);
    const query = async (statement: string, parameters: readonly VerificationQueryParameter[] = []) => {
        if (!statement.trim() || statement.length > 1_000_000 || parameters.length > 256) {
            throw new Error("Upgrade fixture database query exceeds its bounded contract");
        }
        return (await database.query(statement, parameters)) as readonly VerificationQueryRow[];
    };
    return Object.freeze({
        context: (stage) =>
            Object.freeze({
                kind: input.kind,
                baselineVersion: input.baselineVersion,
                targetVersion: input.targetVersion,
                stage,
                database: Object.freeze({ query }),
                cms: Object.freeze({
                    request: async (path: string, request?: UpgradeFixtureJsonRequestV1) =>
                        await fixtureHttpResponse(
                            await input.client().authenticatedRequest(path, jsonRequestInit(request)),
                        ),
                }),
                ...services,
            }),
        close: async () => await database.close(),
    });
}
