# Delivery vocabulary and ident-safe delivery

## Glossary (always-on)

| User phrase | Means | Artifact |
|---|---|---|
| «собрать / собрать для переноса / собрать в прод» | build a binary for another infobase | `.cfe` / `.cf` (update: `.cfu`) |
| «исходники / выгрузить исходники» | source dump for VCS or inspection | XML/BSL under `src/**`, or a dump under `build/` |
| «поставить / залить / обновить в базе» | load the built binary into the target infobase | `.cfe`/`.cf` load + extension apply |
| «дельта / что реально изменилось» | the real change set without platform noise | a report, not the raw dump |

- Never answer «собрать» with `Copy-Item` of XML. «Собрать» = binary artifact.
- If the phrase is ambiguous, ask **one** question: binary or sources.
- Project layout: `src/{cf,cfe,epf,erf}` is XML/BSL sources; `build/{cf,cfe,epf,erf}` holds compiled binaries named `OriginalName_YYYYMMDD` (gitignored). `docs/` is project documentation; `docs/techtask/` holds raw technical assignments for the agent. `RELEASE_PATH` overrides the `build/` root when set.

## Ident-safe extension delivery

Loading an extension dump into an infobase and dumping it back rewrites UUIDs (pictures, borrowed objects, form
identity) and produces a misleading comparison: "объект изменён / только в файле / порядок изменён".

Rules:

1. Never do "XML load → `/DumpCfg` of the whole extension" when the target infobase already contains that
   extension.
2. Prefer building the binary from the git tree (`src/cfe/<Extension>`) without platform rewriting, or dump only
   the borrowed/touched object.
3. Fix the source of truth before delivery: git XML tree or the live infobase. If a form was changed in the
   Designer, say so; never mix silently.
4. Report the expected delta (which object/form) separately from the comparison noise.
5. A verified delivery ends with the binary + a ПОСТАВКА note, not with "источники лежат в build/".

## ПОСТАВКА.md template

```md
# ПОСТАВКА <extension> <version>

- Источник истины: git `src/cfe/<extension>` @ <commit>
- Артефакт: `build/cfe/<extension>_YYYYMMDD.cfe` (sha256 …)
- Что реально в дельте: <объект/форма>
- Ожидаемые строки сравнения: <список>
- Ложные строки сравнения (шум платформы): «только в файле», «порядок изменён», перезапись UUID
- Проверено: <какая ИБ, чем, результат>
- UNVERIFIED: <что не проверено>
```
