# @bernouy/email-templates

Owns reusable template definitions, immutable publications and bounded pure rendering.
Consumers own associations, delivery, business values and installation seeds.
No environment, network, delivery or filesystem reads in the feature runtime.
Publish only explicit safe HTML; no executable templates or raw HTML variables.
Mongo adapters are composition-root exports. Never persist render values/results.
