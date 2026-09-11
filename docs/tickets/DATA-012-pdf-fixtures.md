# DATA-012: Create licensing-safe PDF extraction fixtures

Status: Open  
Priority: Blocker  
Dependencies: DATA-001

## Objective

Provide deterministic extraction tests without committing complete Ministry PDFs whose redistribution terms are unclear.

## Scope

- Define a fixture policy that stores source URL, report identity, content hash, and attribution.
- Create synthetic text fixtures representing the observed Ministry headers and national/province table layouts.
- Create minimal factual normalized fixtures for reports dated 6-9 September.
- Cover split names, control characters, decimal commas, thousands separators, page boundaries, `A ventiler`, and missing values.
- Add an optional non-CI command that downloads current public reports for local integration verification.

## Non-goals

- Committing or redistributing full Ministry PDFs.
- Replacing deterministic unit tests with live-network tests.
- Treating the fixture policy as legal advice.

## Deliverables

- Documented fixture-generation and attribution policy.
- Synthetic parser fixtures and expected normalized outputs.
- Optional current-report integration-check command.
- Tests proving live downloads are not required for the deterministic suite.

## Acceptance criteria

- No full Ministry PDF is committed.
- Fixtures contain only the minimum structure and factual records necessary for testing.
- All known extraction edge cases are represented.
- A format-drift fixture fails closed.
- The optional integration check records URL and content hash without modifying publishable data.

## Verification

Run fixture tests offline, confirm no PDF binaries are tracked, run the optional integration check separately, then run `vp check` and `vp test --run`.
