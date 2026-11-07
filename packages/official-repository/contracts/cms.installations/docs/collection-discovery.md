# Bounded Collection Discovery

`list-collection-catalogue` returns at most 25 collections per page, selecting the
latest non-yanked release of each collection in the requested stable, beta or all
channel. It queries the configured Repository's `collection-catalogue` capability.
The Repository must expose that capability; an unavailable service is not replaced
with an unbounded history scan.

Only the requested page's immutable release metadata is verified. No binary assets
are downloaded for discovery. Verification results may be shared by exact
Repository, publisher, collection, version and digest. Installation state and
suggested actions are read freshly for the current site; cached data never grants
installation authority.

`list-collection-releases` reads one bounded history page for one exact Repository
and collection. Cursors belong to the source and channel that issued them. Changing
channels starts at the first page. `get-collection-release` verifies one exact
release and returns its browser authority without downloading assets.

Installation and upgrade preparation still verify the full exact bundle, current
capability requirements, explicit browser approval and site revisions. Discovery
neither installs resources nor changes selections. Earlier `list-available-collections`
behavior remains available to consumers pinned to that API.
