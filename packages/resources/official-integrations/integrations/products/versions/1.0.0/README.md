# Products 1.0.0

Supabase-backed product catalogue integration.

This version owns catalogue structure only:

- brands
- categories
- products
- product variants
- attributes and attribute options
- internal product and variant media links
- product and variant image uploads in Supabase Storage
- external references for imports

It intentionally does not model vendors, prices, offers, orders, stock,
payments, carts, reservations, delivery, or Stripe state. Those domains should
live in separate modules and reference catalogue product or variant ids when
needed.

The bundled Supabase connector deploys:

- a private `products` schema
- a private `products-media` Supabase Storage bucket for catalogue images
- RLS-enabled catalogue tables
- the `cms-products` Edge Function
- a generated `CMS_PRODUCTS_API_KEY` secret

The CMS source talks only to the Edge Function. The Supabase service-role or
secret key remains owned by the Supabase runtime and must not be exposed through
the CMS source configuration.

The `products-media` bucket accepts JPEG, PNG, WebP, GIF, and AVIF images up to
10 MiB. Uploads and reads are performed through `cms-products`; browsers never
receive a Supabase service key or direct bucket URL. Media rows and link tables
are internal implementation details. The dashboard exposes image upload fields
directly on products and variants.
