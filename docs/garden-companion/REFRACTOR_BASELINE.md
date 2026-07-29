# Garden Companion Refactor Baseline

Version: 1.0
Date: 2026-07-16
Status: Captain-approved planning baseline

## Purpose

This document is the implementation bridge between:

- North Star philosophy docs in this folder
- The current ArborDex homeowner code and schema
- A safe, phased refactor plan with minimal breakage

This is a planning and sequencing artifact. It does not override NORTH_STAR.md.

## Current System Snapshot

### Existing Core Tables

- `public.homeowner_profiles`
- `public.homeowner_plants`
- `public.homeowner_plant_journal_entries`
- `public.homeowner_garden_companion_messages`
- `public.homeowner_qr_tag_orders`

### Existing Core API Areas

- Homeowner account and billing
- Plant CRUD and photo management
- Plant journal CRUD
- Garden Companion session/chat/layout
- Diagnostics and scan-to-plant flows

## Context Model Mapping (Current -> Target)

### 1) User

- Current: Implemented (`auth.users` + `homeowner_profiles`)
- Target: Keep and extend
- Notes:
  - Already supports tiering and garden-level settings.

### 2) Property

- Current: Partial (implicit in profile metadata)
- Target: New first-class entity
- Needed:
  - Dedicated property identity and property-level attributes.

### 3) Spaces

- Current: Missing as explicit model
- Target: New first-class entity
- Needed:
  - Property -> spaces relationship and typed zones.

### 4) Garden Beds

- Current: Partial (`bed_number`, `row_section_id` on plant)
- Target: New first-class entity
- Needed:
  - Bed identity, geometry, characteristics, and timeline.

### 5) Plants

- Current: Implemented (`homeowner_plants`)
- Target: Keep and extend
- Needed:
  - Richer relationship links to property/space/bed.

### 6) Trees

- Current: Not first-class in homeowner schema
- Target: Add in phased way
- Needed:
  - Tree-specific history and risk tracking model.

### 7) Events

- Current: Implemented via `homeowner_plant_journal_entries`
- Target: Keep and broaden taxonomy
- Needed:
  - Expand event vocabulary and eventually normalize by event category.

### 8) Observations

- Current: Partial (in diagnostics payload + journal notes)
- Target: New first-class entity
- Needed:
  - Structured observation records with evidence and confidence.

### 9) Tasks

- Current: Partial (implied in notes/reminders)
- Target: New first-class entity
- Needed:
  - Task lifecycle tied to plants/beds/events.

### 10) Conversations

- Current: Implemented (`homeowner_garden_companion_messages`)
- Target: Keep and enrich
- Needed:
  - Structured memory extraction and references to records.

### 11) Photos

- Current: Implemented as URL arrays on plant
- Target: Evolve toward first-class photo records
- Needed:
  - Photo metadata, linkage, and observation associations.

### 12) Weather

- Current: Implicit/ephemeral in AI context
- Target: New first-class memory entity
- Needed:
  - Historical weather snapshots connected to events and outcomes.

## Decisions for First Refactor Wave

### Keep As-Is (for now)

- `homeowner_profiles`
- `homeowner_plants`
- `homeowner_plant_journal_entries`
- `homeowner_garden_companion_messages`

### Evolve Incrementally

- Journal event taxonomy and validation
- Garden companion context builder
- Diagnostics memory persistence strategy

### Add New Entities (non-breaking)

- Property
- Space
- Bed
- Observation
- Task
- Weather snapshot

## Non-Breaking Migration Strategy

1. Add new tables without removing existing columns or endpoints.
2. Backfill from current homeowner records.
3. Introduce dual-write in selective API paths.
4. Add read-fallbacks to old structure.
5. Flip primary reads to new structure only after verification.
6. Defer cleanup/removal until stable for multiple release cycles.

## Initial Guardrails

- Favor additive migrations.
- Preserve historical records.
- Avoid destructive schema changes in early waves.
- Keep existing homeowner endpoints operational during transition.
- Track source of truth for each field during dual-write periods.

## Immediate Next Step Candidates

1. Define `property`, `space`, and `bed` table drafts and relations.
2. Add a minimal `observations` table to capture structured notes from diagnostics/journal.
3. Create an API-level context resolver that prioritizes property -> space -> bed -> plant history.

## Progress Update

- 2026-07-16: Wave 1 additive schema draft created at `server/sql/2026_07_16_homeowner_property_space_bed_foundation.sql`.
- 2026-07-16: Homeowner journal event type limit increased to 20 in backend/frontend production flow.
- 2026-07-16: Demo journal event options intentionally left unchanged (demo remains limited behavior).
- 2026-07-16: Additive observations schema draft created at `server/sql/2026_07_16_homeowner_observations_foundation.sql`.
- 2026-07-16: Garden Companion context builder now reads property/space/bed memory with migration-safe fallbacks in `server/index.js`.
- 2026-07-16: Read-only homeowner context graph endpoint added at `/api/homeowners/garden-companion/context-graph` (optional `include_records=1`).
- 2026-07-16: Opt-in Garden Companion context graph debug panel added to `client/src/pages/HomeownerPlants.jsx` via `?debug=context-graph`.
- 2026-07-17: Garden Companion prompt now receives exact `plant_roster` and `plant_history_summary` data to prevent invented plant names.
- 2026-07-17: Explicit fallback rule added to prompt: when history is requested but no journal entries exist, state "No journal events have been recorded" then list two most recent diagnostic records contextually.
- 2026-07-17: Prompt rule refined to be prescriptive: model must start with exact phrase and focus only on two most recent diagnostics, not summarize all plants.
- 2026-07-17: Smart scoping rule applied: brief history overview shows only plants with significant diagnostic findings (issues, recent activity, health concerns), not comprehensive plant lists. Scales naturally with garden size.
- 2026-07-17: Two-tier response pattern: brief overview with actionable findings + offer for in-depth history on user request.

## Captain Control Note

All implementation choices remain captain-directed. This baseline is a map, not an autonomous migration plan.
