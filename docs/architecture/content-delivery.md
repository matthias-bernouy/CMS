# Typed Content Delivery

`ulvia.cms.content:delivery.read` transports named Content projections between
Provider and Kernel. `@bernouy/cms-content/delivery` defines their V1 input and
result types and the validators used by both processes. The protocol is owned
by Content and does not depend on Repository storage or a particular database.

## Operations and validation

`DeliveryOperation` selects one entry in `DeliveryInputs` and `DeliveryResults`.
The operation registry validates the complete result before the Provider encodes
it, and again after the Kernel decodes it. The Kernel chooses the result type
from the operation; callers cannot substitute an arbitrary generic result type.

Validation covers Pages and route variants, contribution provenance, capability
requirements, renderable Bloc roots and browser declarations, theme/settings
projections, localized text values, behavior sources and collection asset metadata.
Unknown fields, invalid nested values and unknown operations reject. Optional
fields are explicit. Decoding returns independent values.

Input validation checks the exact operation's fields, Page reference variants,
array bounds and text values before any Provider work. A malformed producer
result becomes `CORE_UNAVAILABLE`; an oversized result becomes
`RESPONSE_TOO_LARGE`. Neither response exposes the rejected data.

## Transport envelope

The capability schema bounds `inputJson` and output `chunks`; the shared
operation protocol validates the data inside those strings. The result envelope
is limited to seven chunks of at most 1,048,576 UTF-16 code units and seven MiB
of encoded envelope bytes. Chunk boundaries preserve Unicode scalar values.
The envelope is transport, not a substitute for operation-specific validation.

The operation names and their result formats form the Content delivery V1
protocol. Changing a projection requires reviewing that protocol and its
consumers together with the contract release. Protocol fixtures cover every
operation; integration tests exercise both Provider and Kernel boundaries.

See the [workspace architecture](README.md) for the read-only `ContentReader`
and the writable `ContentRepository`, and [reviewed upgrades](release-upgrades.md)
for the separate contract and collection selection lifecycles.
