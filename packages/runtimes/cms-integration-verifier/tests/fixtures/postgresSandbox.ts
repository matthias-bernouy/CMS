import { runPostgresVerificationSandboxExecutable } from "../../src/sandbox/postgresMain";
import { createPostgresPlatformVerificationAdapter } from "./postgresAdapter";

await runPostgresVerificationSandboxExecutable(createPostgresPlatformVerificationAdapter());
