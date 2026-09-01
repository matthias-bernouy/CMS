# Restaurant 1.0.0

Restaurant installs a reusable header, a navigation overlay, and three image-led hero blocs for restaurant websites.

## Blocs

- `restaurant-header` provides utility and compact layouts, flow, overlay, and sticky positioning, and transparent, solid, or blurred surfaces.
- `restaurant-menu` owns menu state, focus management, scroll locking, editable interior slots, and curtain, drawer, or panel presentations.
- `restaurant-hero-gallery` centers the restaurant identity above a main image framed by two editable galleries.
- `restaurant-hero-split` places a tall feature image beside the identity, calls to action, restaurant details, and an image rail.
- `restaurant-hero-cover` overlays the identity and calls to action on a panoramic image with an image rail.

The header owns only the editable trigger and emits a menu request for its `menu-target`. The menu bloc owns opening behavior and interior presentation. A page composition connects them by matching the header target to the menu `id`, so either bloc can be replaced independently. All meaningful text, links, and media are editable through content slots.

Every hero rotates its main photograph every 5 seconds by default, with 8- and 10-second alternatives. Selecting a thumbnail slides it into the main position and restarts the progress timer. Mobile layouts expose the photographs in a touch-friendly, snapping rail. Autoplay can be disabled and is automatically suspended when reduced motion is requested.

The default image sources are intentionally empty. Select site media and provide useful alternative text before publishing.
