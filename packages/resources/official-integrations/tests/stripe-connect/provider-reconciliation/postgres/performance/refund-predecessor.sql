\set ON_ERROR_STOP on

\if :{?row_count}
\else
    \set row_count 100000
\endif
\if :{?distribution}
\else
    \set distribution majority
\endif

create temporary table refund_predecessor_parameters (
    row_count integer check (row_count between 1000 and 200000),
    distribution text check (distribution in ('rare', 'majority', 'future'))
);
insert into refund_predecessor_parameters values (:row_count, :'distribution');

set jit = off;
set work_mem = '4MB';
set statement_timeout = '10s';

create temporary table refund_predecessor_base (
    id bigint generated always as identity primary key,
    operation_id bigint not null,
    projection_kind text not null,
    causal_sequence integer not null,
    projection_status text not null,
    next_attempt_at timestamptz,
    claimed_at timestamptz,
    created_at timestamptz not null
);
create index refund_predecessor_base_claim_idx
    on refund_predecessor_base(
        projection_status, next_attempt_at, created_at, id
    );

create temporary table refund_predecessor_candidate
    (like refund_predecessor_base including all);
create index refund_predecessor_candidate_idx
    on refund_predecessor_candidate(operation_id, causal_sequence)
    where projection_kind = 'refund' and projection_status <> 'succeeded';

with seed as (
    select
        ((position - 1) / 1000)::bigint batch,
        ((position - 1) % 1000)::integer slot,
        position
    from pg_catalog.generate_series(1, :row_count::integer) position
), classified as (
    select *, case :'distribution'
        when 'rare' then case
            when slot < 2 then batch % 20 = 0
            else position % 20 = 0
        end
        else case
            when slot < 2 then (batch + 1) % 5 <> 0
            else position % 5 <> 0
        end
    end active
    from seed
)
insert into refund_predecessor_base (
    operation_id, projection_kind, causal_sequence,
    projection_status, next_attempt_at, claimed_at, created_at
)
select
    case when slot < 2 then batch + 1 else :row_count::integer + position end,
    case when slot < 2 then 'refund' else 'payment' end,
    case when slot < 2 then slot else 0 end,
    case when active then 'pending' else 'succeeded' end,
    case
        when not active then null
        when :'distribution' = 'future'
             and case when slot < 2 then batch % 10 <> 0 else position % 10 <> 9 end
            then now() + interval '1 hour'
        else now() - interval '1 minute'
    end,
    null,
    '2026-07-21 00:00:00+00'::timestamptz
        + position * interval '1 millisecond'
from classified;

insert into refund_predecessor_candidate
overriding system value
select * from refund_predecessor_base;
analyze refund_predecessor_base;
analyze refund_predecessor_candidate;

select :'distribution' distribution, :row_count::integer row_count,
    pg_catalog.pg_size_pretty(pg_catalog.pg_relation_size(
        'refund_predecessor_candidate_idx'
    )) candidate_index_size;

select 'baseline' plan;
explain (analyze, buffers, timing off)
select projection.id
from refund_predecessor_base projection
where projection.projection_status in ('pending', 'retry')
  and (projection.next_attempt_at is null or projection.next_attempt_at <= now())
  and not (
      projection.projection_kind = 'refund'
      and exists (
          select 1
          from refund_predecessor_base predecessor
          where predecessor.operation_id = projection.operation_id
            and predecessor.projection_kind = 'refund'
            and predecessor.causal_sequence < projection.causal_sequence
            and predecessor.projection_status <> 'succeeded'
      )
  )
order by projection.created_at, projection.causal_sequence, projection.id
for update skip locked
limit 50;

select 'candidate' plan;
explain (analyze, buffers, timing off)
select projection.id
from refund_predecessor_candidate projection
where projection.projection_status in ('pending', 'retry')
  and (projection.next_attempt_at is null or projection.next_attempt_at <= now())
  and not (
      projection.projection_kind = 'refund'
      and exists (
          select 1
          from refund_predecessor_candidate predecessor
          where predecessor.operation_id = projection.operation_id
            and predecessor.projection_kind = 'refund'
            and predecessor.causal_sequence < projection.causal_sequence
            and predecessor.projection_status <> 'succeeded'
      )
  )
order by projection.created_at, projection.causal_sequence, projection.id
for update skip locked
limit 50;
