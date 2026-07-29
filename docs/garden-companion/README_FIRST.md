# Welcome to ArborTag

If you are reading this, you are about to contribute to ArborTag.

Before writing code, changing architecture, modifying prompts, designing features, or making recommendations, stop and read the documents below in order.

These documents define the philosophy of ArborTag. They are considered part of the product itself.

## Required Reading Order

1. `NORTH_STAR.md`
   - Purpose: Understand why ArborTag exists.
   - This document defines the mission, long-term vision, and the principles that should guide every product decision.
   - If you only read one document, read this one.
   - Question it answers: Why are we building Garden Companion?

2. `CONTEXT_MODEL.md`
   - Purpose: Understand how Garden Companion understands the world.
   - This document defines the conceptual model behind the application.
   - It describes users, properties, gardens, plants, trees, garden beds, events, observations, relationships, memory, and stewardship.
   - Question it answers: What exists in Garden Companion's world?

3. `AI_PRINCIPLES.md`
   - Purpose: Understand how Garden Companion should think.
   - This is not a prompt.
   - It is the permanent philosophy that should guide every AI implementation regardless of the language model or provider.
   - Read this before modifying prompts, AI workflows, recommendations, or conversational behavior.
   - Question it answers: How should Garden Companion reason?

4. `ARCHITECTURE.md`
   - Purpose: Understand how the system should be built.
   - This document explains the architectural philosophy behind Garden Companion.
   - It focuses on memory, context, historical preservation, relationships, scalability, and long-term maintainability.
   - Question it answers: How should we design technical solutions?

5. `ROADMAP.md`
   - Purpose: Understand where Garden Companion is going.
   - This document explains the intended evolution of the platform over many years.
   - Features should support the roadmap rather than compete with it.
   - Question it answers: What should we build next?

## Before You Make Any Change

Ask yourself the following questions:

- Vision: Does this move Garden Companion closer to its North Star?
- Memory: Will this improve Garden Companion's long-term understanding of the user's garden?
- Context: Does this increase contextual awareness rather than generic knowledge?
- Trust: Will this strengthen user trust?
- Stewardship: Does this encourage better care for living things?
- Longevity: Will this still make sense five years from now?

If several answers are "No," reconsider the implementation.

## Product Priorities

When making decisions, prioritize in this order:

1. Stewardship
2. Trust
3. Memory
4. Context
5. Understanding
6. Simplicity
7. Intelligence
8. Features

Features exist to strengthen the first seven priorities, not replace them.

## Development Philosophy

- Favor systems over shortcuts.
- Favor relationships over isolated records.
- Favor history over current state.
- Favor understanding over automation.
- Favor clarity over cleverness.
- Favor maintainability over speed.
- Favor long-term value over short-term novelty.

Build foundations that future versions of Garden Companion can grow upon.

## AI Contributor Guidelines

If you are an AI coding assistant:

- Do not immediately generate code.
- First understand the existing architecture.
- When uncertain, ask questions rather than making assumptions.
- Avoid introducing duplicate concepts that already exist elsewhere in the project.
- Reuse existing entities whenever possible.
- Every new feature should strengthen the existing ecosystem rather than create a parallel one.
- Code should reflect the philosophy described in these documents, not merely satisfy the immediate request.

## Human Contributor Guidelines

If you are a human contributor:

- Do not think of Garden Companion as a collection of screens or features.
- Think of it as a long-term companion whose value compounds over years through memory, context, and trust.
- Whenever possible, choose solutions that preserve history and deepen understanding.

## Definition of Success

Success is not measured by how many features Garden Companion contains.

Success is measured by how deeply it understands a user's garden and how much that understanding helps people become better stewards of the living world around them.

Everything else is secondary.

## The ArborTag Promise

- Garden Companion should become more valuable every season.
- Every conversation should improve future conversations.
- Every observation should strengthen memory.
- Every season should deepen understanding.
- Every line of code should contribute to that vision.

If a change makes Garden Companion feel more like a knowledgeable companion and less like generic software, it is probably the right change.

## The Final Reminder

Technology will evolve.

Programming languages will change.

Frameworks will be replaced.

AI models will improve.

The philosophy of ArborTag should remain constant.

Protect the vision.

Protect the user's trust.

Protect the garden's story.

Everything else can evolve.
