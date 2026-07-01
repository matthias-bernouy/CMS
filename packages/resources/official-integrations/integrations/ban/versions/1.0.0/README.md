# Base Adresse Nationale Integration

This resource stores the official CmsCore source contract and dashboard for the
public French Base Adresse Nationale geocoding API.

## Files

- `sources/ban.source.json`: public address search and reverse-geocoding source
  contract.
- `definition.json`: source contract plus the address-search dashboard artifact.

## CMS Installation

Import `definition.json` with kind `ban`. The definition installs the public
BAN source contract and a small address-search dashboard without writing
secrets.
