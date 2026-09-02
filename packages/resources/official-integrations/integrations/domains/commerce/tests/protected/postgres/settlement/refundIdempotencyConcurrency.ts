export async function runRefundIdempotencyConcurrencyProof(psql: string, databaseUrl: string): Promise<void> {
    console.info("[postgres-contracts] Commerce allocated refund concurrent replay");
    const requestSql = `
        set role service_role;
        select commerce.request_allocated_order_refund(
            order_row.id,
            'concurrent_full_refund',
            terms.merchandise_subtotal_amount,
            terms.shipping_amount,
            terms.buyer_protection_fee_amount,
            'admin',
            'refund-concurrency-admin',
            'opaque-concurrent-operation'
        )
        from commerce.orders order_row
        join commerce.order_financial_terms terms on terms.order_id = order_row.id
        where order_row.order_number = 'REFUND-CONCURRENCY-1';
    `;
    const children = [1, 2].map(() =>
        Bun.spawn(
            [
                psql,
                "--dbname",
                databaseUrl,
                "--no-psqlrc",
                "--set=ON_ERROR_STOP=on",
                "--quiet",
                "--command",
                requestSql,
            ],
            { stderr: "pipe", stdout: "pipe" },
        ),
    );
    const results = await Promise.all(
        children.map(async (child) => {
            const [exitCode, stdout, stderr] = await Promise.all([
                child.exited,
                new Response(child.stdout).text(),
                new Response(child.stderr).text(),
            ]);
            return { exitCode, stdout, stderr };
        }),
    );
    const failed = results.find((result) => result.exitCode !== 0);
    if (failed) {
        throw new Error(`Concurrent allocated refund replay failed: ${failed.stderr.trim() || failed.stdout.trim()}`);
    }

    const verificationSql = `
        set role service_role;
        select
            (select count(*) from commerce.refund_requests refund
                where refund.order_id = order_row.id)::text || ':' ||
            (select count(*) from commerce.audit_events audit
                where audit.order_id = order_row.id
                  and audit.aggregate_type = 'refund_request'
                  and audit.event_type = 'refund_requested')::text || ':' ||
            (select count(*) from commerce.outbox_events outbox
                where outbox.order_id = order_row.id
                  and outbox.topic = 'commerce.refund.requested')::text
        from commerce.orders order_row
        where order_row.order_number = 'REFUND-CONCURRENCY-1';
    `;
    const verification = Bun.spawn(
        [
            psql,
            "--dbname",
            databaseUrl,
            "--no-psqlrc",
            "--set=ON_ERROR_STOP=on",
            "--quiet",
            "--tuples-only",
            "--no-align",
            "--command",
            verificationSql,
        ],
        { stderr: "pipe", stdout: "pipe" },
    );
    const [exitCode, stdout, stderr] = await Promise.all([
        verification.exited,
        new Response(verification.stdout).text(),
        new Response(verification.stderr).text(),
    ]);
    const proof = stdout.trim().split("\n").at(-1);
    if (exitCode !== 0 || proof !== "1:1:1") {
        throw new Error(`Concurrent allocated refund replay mutated durable state: ${stderr.trim() || stdout.trim()}`);
    }
}
