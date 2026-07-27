# Marketplace service withdrawal requests

Commerce records an authenticated buyer's explicit online withdrawal or
termination request concerning a marketplace service attached to an order.
This is an evidence and review workflow. It does not infer whether a statutory
right applies, and it never cancels an order, changes fulfillment, creates a
refund, or moves money.

This workflow is distinct from:

- cancelling an order;
- opening a marketplace claim;
- withdrawing or cancelling a negotiation proposal.

## Source endpoints

The Commerce source exposes these stable operations:

- `submitMyMarketplaceServiceWithdrawalRequest` submits a confirmed buyer
  request;
- `myMarketplaceServiceWithdrawalRequests` reads only the authenticated
  buyer's requests;
- `marketplaceServiceWithdrawalRequests` provides the administrator queue;
- `reviewMarketplaceServiceWithdrawalRequest` applies an administrator review
  transition with an expected version.

Submission requires an order id, a stable `serviceScope`, `confirmed: true`, and
an idempotency key. A reason is optional. The server derives the buyer from the
authenticated CMS request and verifies that the order belongs to that buyer.
The same buyer and idempotency key replay the original response only when the
request payload is identical. A second request for the same order and scope is
rejected rather than creating ambiguous evidence.

## Evidence and audit

The immutable submission evidence contains:

- the buyer CMS identity and order;
- the site-defined service scope and optional reason;
- the confirmation contract key and database timestamp;
- the latest accepted version id and content hash for every buyer legal
  document available on that order at submission time;
- the idempotency request hash.

Every submission and review transition has an immutable request event plus a
Commerce audit and outbox event. Public Data API roles have no table or function
access. The Edge Function uses the service role after the CMS Source boundary
has established buyer or administrator identity.

## Review lifecycle

Requests start in `submitted`. An administrator can move them to
`under_review`, `information_requested`, or `resolved`. A resolved request must
record one of `accepted`, `rejected`, or `no_action`. Review writes require the
current version and fail on stale or terminal state.

Those values record a human processing decision only. If the decision requires
an order cancellation, refund, seller recovery, or another financial effect,
the operator must invoke the corresponding independently authorized Commerce
workflow. Integrators must not interpret `resolved/accepted` as evidence that a
provider operation has happened.

## Site integration responsibility

The database deliberately accepts requests in any order state and does not
calculate a legal deadline. The site and its legal reviewer own:

- which service scopes are presented;
- the wording and version of the visible confirmation;
- any eligibility guidance or deadline shown to the buyer;
- the operational procedure followed after administrator review.

`serviceScope` is a generic lowercase identifier such as a site's reviewed
service key. It is evidence of what the buyer selected, not a legal
classification produced by Commerce.

Commerce does not bundle a presentation block for this workflow in `1.0.0`.
Legal labels, applicable scopes, deadlines, and linked published documents are
site-specific and versioned. A generic block could present a right that does
not apply or weaken the evidentiary link to the site's reviewed copy. Sites
should build their reviewed form from Basic Blocs, bind it to the submission
endpoint, display an explicit confirmation control, and generate a fresh
idempotency key per intended request.
