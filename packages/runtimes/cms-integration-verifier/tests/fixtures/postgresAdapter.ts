import type { PostgresInstallAndReapplyAdapter } from "../../src";
import { DIGEST_A, DIGEST_B, DIGEST_C } from "./contracts";

export function createPostgresInstallAndReapplyAdapter(): PostgresInstallAndReapplyAdapter {
    return {
        async environmentVersions() {
            return [{ name: "postgres", version: "16.4" }];
        },
        async applyPackageSql({ phase }, signal) {
            signal.throwIfAborted();
            return {
                observedSchemaDigest: DIGEST_A,
                evidenceDigest: phase === "install" ? DIGEST_B : DIGEST_C,
                durationMs: 5,
            };
        },
    };
}
