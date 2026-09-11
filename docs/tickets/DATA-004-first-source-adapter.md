# DATA-004: Build the first authoritative source adapter

Status: Complete  
Priority: High  
Dependencies: DATA-002, DATA-003, DATA-012
Resolution: Implemented DRC Ministry index discovery and guarded extraction adapter in server/pipeline/adapters/drc-ministry-adapter.js, prioritizing newest reports strictly by parsed epidemiological date, recording content SHA-256 hashes, generating normalized national and provincial observations, and failing closed on drift or reconciliation mismatch.

## Objective

Prove one complete ingestion path from authoritative retrieval through validated normalized output.

## Scope

- Discover the latest DRC Ministry SitRep from its public index.
- Retrieve it with timeout, bounded retry, content hashing, and source metadata.
- Extract report identity, national totals, and province totals.
- Normalize and reconcile without publishing to the application yet.

## Non-goals

- Parsing every operational table in the report.
- Making PDF health-zone extraction the primary path.
- Updating the UI or current snapshot.

## Deliverables

- Ministry index discovery adapter.
- Guarded PDF extraction adapter.
- Source fixtures or reproducible fixture-generation tooling.
- Unit and failure-mode tests.

## Acceptance criteria

- The newest report is selected by parsed reporting date, not filename or link order.
- Report identity, dates, URL, and content hash are retained.
- National and province values match the report.
- Format drift, wrong content, timeout, or inconsistent totals fail closed.
- An unsuccessful run does not advance any source timestamp.
- Re-ingesting identical content produces identical epidemiological output.

## Verification

Test four consecutive reports and one malformed fixture. Run `vp check` and `vp test --run`.
