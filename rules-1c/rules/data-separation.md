---
description: Data separation in 1C (разделители, область данных). Load when a task mentions a separator, a divided infobase, tenant boundaries, or safe queries and jobs in a separated database.
alwaysApply: false
---

# Data separation

> **Profile delta (Pi).** Inlined rule, not a routed standard. Kept on the next `/review-airules`. Do not wholesale-replace it from `comol/ai_rules_1c`, and do not move the body into `rules-1c/standards/`.

Load this file when the configuration uses separators (`разделители`). A common infobase without separators does not need it.

## 1. Boundary

- Name the separator and the session area before writing a query, a job, or an exchange.
- A query, a background job, and an exchange run inside one area unless the task explicitly crosses areas. Crossing areas is a privileged operation and is stated in the delivery report.
- Do not cache a reference, a constant, or a slice from one area and reuse it in another.

## 2. Queries and rights

- Filter by the session area. Do not add the separator value as a literal from another tenant.
- RLS and roles are checked inside the area the user is in. An administrator of one area is not evidence about another.
- A join that reaches an undivided object is allowed only when that object is shared by design. Say so next to the query.

## 3. Jobs and exchange

- A scheduled job records which area it runs in. A job with an empty area in a divided infobase is a defect.
- An exchange message carries the area it was registered in. Do not register changes from one area into a node that belongs to another.
- Conversion rules (КД 2 / КД 3) stay in `skills/kd2-rules` and `skills/kd31-rules`. This file does not replace them.
