# Products offers link 1.0.0

Declares the semantic relation between the official Products and Offers
integrations.

This integration does not deploy a connector or create storage. It uses the
existing `offers.productId` reference and optional `offers.variantId` reference
and registers a paginated `product-offers` relation:

- `from`: products source, product id;
- `to`: offers source, offer id;
- `binding`: calls `offers.offers` with `productId`;
- `page`: uses `items`, `total`, `limit`, and `offset`.

It also attaches a paginated Offers table to the Products dashboard
`productDetail` view, changes the Offers dashboard `productId` field into a
Products lookup, and changes `variantId` into a product-scoped Variants lookup.

Install Products and Offers first, then install this link integration.
