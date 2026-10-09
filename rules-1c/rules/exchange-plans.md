---
description: Exchange plans and distributed infobases (план обмена, РИБ, регистрация изменений). Load when a task mentions an exchange plan, a distributed infobase, change registration, or a message load conflict. Conversion rules (КД 2 / КД 3) stay in their own skills.
alwaysApply: false
---

# Exchange plans and distributed infobases

> **Profile delta (Pi).** Inlined rule, not a routed standard. Kept on the next `/review-airules`. Do not wholesale-replace it from `comol/ai_rules_1c`, and do not move the body into `rules-1c/standards/`.

This file is the exchange plan and the distributed infobase (РИБ). Правила конвертации in a live КД infobase stay in `skills/kd2-rules` and `skills/kd31-rules`.

## 1. Composition

- Name the plan and the node before registering or sending anything.
- The plan composition is the list of objects that participate. An object outside that list is not registered by writing it.
- A distributed infobase node has one master direction for configuration changes. Do not send a configuration update to the central node from a peripheral one.

## 2. Change registration

- Write the object through the platform so registration runs. A direct SQL write or a disabled registration flag leaves the node without the change.
- `ОбменДанными.Загрузка = Истина` skips registration and skips the checks that must not run on load. Set it only in the load path. Do not leave it set for an interactive write.
- Auto-registration that is too wide is a defect: a node should not receive objects it does not store.

## 3. Message

- One message is one node and one number. Do not reuse a message number after a successful load.
- Load is idempotent for the same message number: a second load of a message already accepted does not apply the body again.
- A conflict is a collision of versions of the same object. Name the rule (master node wins, or the later version wins) before writing the handler. Do not silently keep both.

## 4. Stop

- Do not model a distributed infobase as a set of HTTP services when an exchange plan is the mechanism the configuration already uses.
- Do not put conversion-rule editing (ПКО, ПКС, ПОД) in this file.
