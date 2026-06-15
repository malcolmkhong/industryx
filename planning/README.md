# IndustriaX Planning Hub

This folder is the canonical planning workspace.

> **Phase numbering note:** This README uses a different scheme than `IMPLEMENTATION_PLAN.md`. The README uses conceptual stages; the implementation plan uses sequential phases. For current implementation status, see `IMPLEMENTATION_PROGRESS.md`.

## Purpose
- Stop doc/code drift
- Recover missing context
- Sequence execution by risk and dependencies

## Planning Document Order (Conceptual Stages)

These are planning documents that define concerns and exit criteria. They do **not** correspond 1:1 with the implementation phases in `IMPLEMENTATION_PLAN.md`.

1. `PHASE_00_SOURCE_OF_TRUTH.md`
2. `PHASE_01_SECURITY_CLOSURE.md`
3. `PHASE_02_SERVER_AUTHORITY_AND_SYNC.md`
4. `PHASE_03_PERFORMANCE_AND_RENDER_STABILITY.md`
5. `PHASE_04_ARCHITECTURE_DECOMPOSITION.md`
6. `PHASE_05_UI_SYSTEM_ALIGNMENT.md`
7. `PHASE_06_RELEASE_READINESS.md`

## Rule
A phase is not complete until exit criteria + validation are satisfied.
