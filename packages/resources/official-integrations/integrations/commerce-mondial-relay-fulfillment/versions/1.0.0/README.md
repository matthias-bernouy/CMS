# Commerce Mondial Relay Fulfillment

This linking integration joins Commerce business authorization to Mondial Relay
provider facts without becoming a second fulfillment authority.

## Seller Flow

`createShipmentForMySale` starts with Commerce `mySale`, verifies the current
seller, and calls the system-only
`getOrderFulfillmentAuthorization(orderPublicId)`. Commerce must return
`allowed: true`; raw Stripe payment state is not used as a substitute for
Commerce authorization.

The function resolves the exact `deliveryQuoteId` stored in Commerce financial
terms. Delivery returns the private recipient and seller fulfillment snapshots
captured before payment; it never reads a mutable latest relay selection or a
seller profile that may have become incomplete after payment.

The immutable Commerce merchandise subtotal is sent as
`declaredValueMinorAmount`. Delivery keeps integer EUR minor units and converts
them exactly at the provider boundary (`12345` becomes XML `123.45`); it never
uses a floating-point domain amount.
The Commerce public order id is the one-shipment idempotency key. A successful
creation records `label_created` through the system-only
`recordOrderFulfillment` command.

There is no buyer shipment-creation function.

`declareShipmentHandoffForMySale` verifies the same seller ownership and
records a seller assertion in Delivery and Commerce. It does not record
`carrier_accepted`. Only a later normalized Mondial Relay first scan can do
that.

## Label Confidentiality

`getShipmentForMySale` and `createShipmentForMySale` never return the
provider label URL.

`requestShipmentLabelForMySale` verifies seller ownership, asks Delivery for a
short-lived seller-bound capability, and returns only a same-origin CMS label
proxy URL. Buyers and unrelated sellers cannot mint or use that token.
Commerce keeps this access available after the seller declares handoff and
until the first trusted carrier scan. A mistaken declaration can therefore be
followed by a secure label re-download without turning seller input into
carrier proof.

`getShipmentForOrder` is buyer-facing and contains tracking only.

## Automatic Reconciliation

`reconcileMondialRelayFulfillments` is system-only. It asks Delivery for a
leased batch of at most 8 pending events and forwards each event to Commerce
`recordOrderFulfillment` using:

```text
orderPublicId
providerEventId
normalizedStatus
occurredAt
providerReference
carrierAcceptedAt?
recipientHandoffAt?
```

Both sides are idempotent. Each event is isolated: a Commerce or acknowledgement
failure records a lease-bound Delivery failure and the loop continues with later
events. The orchestration acknowledges an event only after Commerce accepts it,
so a poison event can retry and eventually move to `manual_review` without
blocking later scans or being reported as successful. The production CmsCore runtime schedules this function
internally; `p9r dev` schedules it only with `--workers`. No browser visit or
public scheduler endpoint is required. Arrival, availability, collection,
pickup expiry, return, incident, and loss remain distinct Commerce facts.

## Cancellation

`cancelMondialRelayShipment` is system-only and applies a Commerce-authorized
pre-carrier cancellation. Delivery accepts it only before seller handoff and
before the first trusted scan. Handoff, cancellation, and carrier
reconciliation compare against the same shipment status, so a concurrent
carrier event makes cancellation fail closed.

Commerce still owns cancellation deadlines, refund processing, claim rules, and
settlement blocking.

## Claim returns

A `return_required` claim remains blocked until a return shipment exists at the
Delivery provider with the immutable external id `claim-return:{claimId}`.

The return flow is server-authoritative:

1. `setRelayPointForMyClaimReturn` lets only the claim seller select the return
   relay. Delivery revalidates the point with Mondial Relay and stores it under
   `claim-return:{claimId}`.
2. `createClaimReturnShipmentForMyPurchase` lets only the claim buyer create or
   retry the shipment. It reads the immutable buyer shipping snapshot, the
   original order quote's private buyer and seller fulfillment snapshots and
   the server-stored return relay; none of those values is accepted from the
   browser. Commerce authorization is checked again immediately before the
   provider call.
3. Delivery uses `claim-return:{claimId}` as its idempotency key. An exact replay
   returns the existing shipment, while a replay with a changed address, relay,
   weight, or metadata fails with `409` before another provider call.
4. `requestClaimReturnLabelForMyPurchase` issues a short-lived capability bound
   to the buyer CMS identity. The browser receives only the same-origin label
   proxy URL, never the Mondial Relay label URL.
5. `getClaimReturnForMe` exposes allowlisted tracking to either claim party;
   `getRelayPointForMyClaimReturn` exposes only the selected relay snapshot.

Once the provider shipment exists, the scheduled
`reconcileMondialRelayFulfillments` worker separates claim-return events from
normal order events, writes them through Commerce `recordClaimReturnDelivery`,
and acknowledges each Delivery event only after Commerce accepts it. The
system-only
`recordMondialRelayClaimReturnCarrierAcceptance` and
`recordMondialRelayClaimReturnRecipientHandoff` functions reload the shipment,
verify that exact claim binding, refresh tracking directly from Mondial Relay,
and project the provider timestamps through Commerce
`recordClaimReturnDelivery`. Carrier acceptance keeps monetary resolution
blocked. Only provider-confirmed recipient handoff to the seller satisfies the
Commerce gate. If the return shipment is missing, misbound, unscanned, or only
declared by an operator, the claim remains fail-closed in `return_required`.

## Seller Bloc

```html
<commerce-mondial-relay-sale-fulfillment
  order-id="order-id">
</commerce-mondial-relay-sale-fulfillment>
```

The bloc can create or safely retry the shipment, request a protected label
download, declare seller handoff, and show tracking. It never queries a raw
provider label URL and never lets the seller mark carrier acceptance or
recipient collection.
