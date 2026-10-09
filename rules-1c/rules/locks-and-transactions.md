---
description: Managed locks, transaction boundaries, lock ordering, deadlock prevention, lock modes, object version conflicts (`Заблокировать` / `ЗаблокироватьДанныеДляРедактирования`, «запись была изменена»), and reading the event log / technological log. Load when designing posting or multi-document operations, debugging lock conflicts or an object edit conflict, or extending a transactional path.
alwaysApply: false
---

# Locks and Transactions — Design Rules

The 1C platform offers two locking subsystems (automatic / managed) and an implicit-transaction model around object writes. Most production lock incidents come from mixing the two, opening unintended transactions, or holding locks across user dialogs. This file is the canonical home for those rules.

> **Scope.** This file owns the design rules. Posting has two patterns, and neither replaces the other: an explicit `БлокировкаДанных` before reading balances, and balance control after the write (ITS 661). `standards(name="platform-solutions") §9 → "Managed locks and deadlock prevention"` keeps a short template of the first pattern and points back here.

<!-- help-mcp-router -->

> **Retrieve through MCP only.** Call `standards(name="locks-and-transactions")` on `1C-docs-mcp` before applying this standard. Retrieval, paging, and unavailable-server policy: `rules-1c/rules/help-corpus-retrieval.md`. Headings below are retrieval targets, not summaries.

## 1. Lock mode of the configuration

## 2. Transaction boundaries

### Implicit transactions

### Explicit transactions in calling code

### Forbidden inside transactions

## 3. Managed-lock primitives

### Modes

## 4. Lock ordering — the deadlock contract

## 5. Locking patterns

### Pattern: posting a document that touches several registers

### Pattern: balance control after the write

### Pattern: mass operation across many documents

### Pattern: status update outside posting

### Pattern: object edit conflict

## 6. Diagnosing lock conflicts and deadlocks

### Symptoms

### Diagnostic tools

### Reading the event log and the technological log

## 7. Companion rules
