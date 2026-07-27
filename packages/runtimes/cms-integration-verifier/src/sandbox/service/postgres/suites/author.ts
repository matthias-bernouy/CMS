import { SQL } from "bun";
import type { BoundIntegrationVerificationAuthorSuiteV1 } from "@bernouy/cms-integration-verification";
import type { VerificationQuery, VerificationQueryRow } from "@bernouy/cms-integration-verification/sdk/v1";
import type { PostgresAuthorVerificationEvidence } from "../../../postgres";
import {
    createAuthorSuiteExecutor,
    type AuthorSuiteExecutor,
    type AuthorSuiteExecutorConfig,
} from "../../../process/author";

const AUTHOR_QUERY_STATEMENT_TIMEOUT_MS = 5_000;
const AUTHOR_IDLE_TRANSACTION_TIMEOUT_MS = 20_000;

export type PostgresAuthorSuiteVerifier = Readonly<{
    verify(
        suites: readonly BoundIntegrationVerificationAuthorSuiteV1[],
        connectionUri: string,
        signal: AbortSignal,
    ): Promise<readonly PostgresAuthorVerificationEvidence[]>;
}>;

type AuthorTransactionDatabase = Readonly<{
    unsafe(statement: string, parameters?: readonly unknown[]): Promise<unknown>;
    close(): Promise<void>;
}>;

export function createPostgresAuthorSuiteVerifier(config: AuthorSuiteExecutorConfig): PostgresAuthorSuiteVerifier {
    const executor = createAuthorSuiteExecutor(config);
    return Object.freeze({
        async verify(suites, connectionUri, signal) {
            const results: PostgresAuthorVerificationEvidence[] = [];
            for (const suite of suites) {
                signal.throwIfAborted();
                const database = new SQL(connectionUri, { max: 1 }) as unknown as AuthorTransactionDatabase;
                results.push(await executeAuthorSuiteTransaction(database, executor, suite, signal));
            }
            return Object.freeze(results);
        },
    });
}

export async function executeAuthorSuiteTransaction(
    database: AuthorTransactionDatabase,
    executor: AuthorSuiteExecutor,
    suite: BoundIntegrationVerificationAuthorSuiteV1,
    signal: AbortSignal,
): Promise<PostgresAuthorVerificationEvidence> {
    let transactionStarted = false;
    try {
        await database.unsafe("BEGIN");
        transactionStarted = true;
        await database.unsafe(`SET LOCAL statement_timeout = '${AUTHOR_QUERY_STATEMENT_TIMEOUT_MS}ms'`);
        await database.unsafe(
            `SET LOCAL idle_in_transaction_session_timeout = '${AUTHOR_IDLE_TRANSACTION_TIMEOUT_MS}ms'`,
        );
        const query: VerificationQuery = async (statement, parameters = []) => {
            signal.throwIfAborted();
            return (await database.unsafe(statement, [...parameters])) as readonly VerificationQueryRow[];
        };
        return await executor.execute(suite, query, signal);
    } finally {
        try {
            if (transactionStarted) {
                await database.unsafe("ROLLBACK");
            }
        } finally {
            await database.close();
        }
    }
}
