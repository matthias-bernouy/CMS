

comment on schema commerce_negotiation is
    'Private bounded price negotiation state for Commerce marketplace offers.';
comment on table commerce_negotiation.proposals is
    'Immutable offer and party snapshots plus the current negotiation decision state.';
comment on table commerce_negotiation.proposal_events is
    'Append-only negotiation lifecycle audit events.';