# Upstream licensing note

During the 2026-09-08 audit, `comol/ai_rules_1c` did not expose a clear root `LICENSE` through the inspected repository metadata.

Therefore this package does **not** redistribute a complete vendored copy of upstream rules by default. It pins a specific upstream commit and bootstraps it locally.

Before publishing a redistributed archive containing the complete upstream rule text, confirm the author's intended license/permission and preserve required attribution.
