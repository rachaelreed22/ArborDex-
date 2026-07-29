# ArborTag Architecture Philosophy

Building Garden Companion for Decades, Not Just Versions

Version: 1.0

## Purpose

This document defines the architectural philosophy behind ArborTag and Garden Companion.

It is not intended to describe every database table or API endpoint.

Instead, it establishes the principles that should guide every engineering decision.

Whenever there are multiple technical approaches available, choose the solution that best aligns with this document and NORTH_STAR.md.

## Core Principle

Garden Companion is a memory system before it is an AI system.

Artificial Intelligence is replaceable.

Memory is not.

The primary responsibility of Garden Companion is to preserve, organize, understand, and build upon everything that happens within a user's garden.

AI exists to help users access and understand that memory.

## System Philosophy

Garden Companion should function as four interconnected layers.

### Layer 1 - The Living Record

This layer answers: "What happened?"

Examples:

- Plant profiles
- Tree profiles
- Photos
- Notes
- Diagnoses
- Weather snapshots
- Tasks
- Harvests
- Bloom events
- Treatments
- Timeline events
- QR scans

Nothing in this layer should be lost unless intentionally deleted by the user.

This layer represents the permanent history of the garden.

### Layer 2 - Knowledge

This layer answers: "What does this information mean?"

Examples:

- Botanical knowledge
- Companion planting
- Soil science
- Disease information
- Pest identification
- Climate knowledge
- Growing recommendations

Knowledge may evolve.

Historical records should not.

### Layer 3 - Context

This is Garden Companion's greatest advantage.

Context answers: "How does this information relate specifically to this garden?"

Examples:

- Soil type
- USDA zone
- Property layout
- Sun exposure
- Water availability
- Nearby plants
- Gardening habits
- Previous conversations
- Historical outcomes

Context transforms information into personalized understanding.

### Layer 4 - Intelligence

This layer answers: "Given everything I know, what should I do?"

Examples:

- Recommendations
- Predictions
- Pattern recognition
- Seasonal reminders
- Personalized guidance
- Diagnostics
- Planning assistance

The Intelligence Layer should never ignore the previous three layers.

## Data Philosophy

Every meaningful piece of information should become part of the garden's long-term history.

Avoid designing systems that only solve immediate problems.

Prefer structures that continue providing value years later.

Data should become richer over time rather than becoming obsolete.

## Relationships Matter

Individual plants are important.

Relationships between plants are equally important.

Examples:

- Which plants share the same bed?
- Which plants compete?
- Which pollinators visit multiple flowers?
- Which diseases spread between neighboring plants?
- Which trees affect shade patterns?

Garden Companion should understand relationships, not isolated records.

## Everything Has a Timeline

Nothing should exist without history.

Every meaningful object should have a timeline.

Examples:

A plant:

- Purchased
- Planted
- First bloom
- Fertilized
- Pruned
- Diagnosed
- Harvested
- Removed

A tree:

- Tagged
- Measured
- Storm damage
- Treatment
- Growth updates
- Health changes

History is a first-class feature.

## Context First

Before generating AI responses, Garden Companion should prioritize the following sources in order:

1. The current plant.
2. The surrounding garden.
3. The user's gardening history.
4. Previous conversations.
5. Property information.
6. Seasonal information.
7. Weather.
8. Botanical knowledge.

Generic knowledge should always come after personalized context.

## AI Should Explain Its Thinking

Recommendations should reference evidence whenever possible.

Instead of:

"Water this plant."

Prefer:

"This hydrangea has gone six days without watering, temperatures have exceeded 90 F, and this same plant showed drought stress under similar conditions last July."

Users should understand why recommendations are made.

## Progressive Intelligence

Garden Companion should become more useful every year.

Year 1: It remembers.

Year 2: It notices patterns.

Year 3: It predicts.

Year 5: It understands the user's gardening habits.

Year 10: It becomes an expert on that specific property.

Long-term value is more important than short-term novelty.

## Database Philosophy

Prefer normalized, well-related data over duplicated information.

Every important object should have a unique identity.

Relationships should be explicit rather than inferred whenever practical.

Design for:

- Scalability
- Auditability
- Historical preservation
- Future AI capabilities

Avoid schemas that make historical analysis difficult.

## Events Over State

Whenever practical, record events instead of simply replacing values.

Instead of only storing:

Current height = 6 feet

Store:

- Measured at 4 feet
- Measured at 5 feet
- Measured at 6 feet

Events create history.

History creates understanding.

## AI Memory

Conversation memory should not be limited to chat history.

Garden Companion should remember:

- Actions
- Observations
- Decisions
- Outcomes
- Preferences

Memory should become structured knowledge whenever appropriate.

## Privacy Philosophy

Users own their gardens.

Users own their memories.

Garden Companion exists to protect that information.

Data should never be collected simply because it can be.

Every stored item should provide long-term value to the user.

## Offline Resilience

Gardens exist outside reliable internet connections.

Whenever practical:

- Cache important information.
- Preserve user input until synchronization succeeds.
- Never lose observations because connectivity is poor.

The garden should always come first.

## Extensibility

Future features should integrate with the existing architecture rather than bypass it.

Examples:

- Marketplace
- Sensor integrations
- Weather services
- Municipal features
- Orchard management
- Estate management
- AI vision
- Smart irrigation

Every new capability should strengthen the existing ecosystem instead of creating isolated silos.

## Technical Decision Checklist

Before implementing a new feature, ask:

- Does this preserve history?
- Does this strengthen memory?
- Does this improve contextual understanding?
- Can it scale for years of accumulated data?
- Does it reduce future technical debt?
- Does it integrate with existing systems instead of duplicating them?
- Will future AI models benefit from this structure?

If the answer is "No" to several of these questions, redesign before implementation.

## Final Engineering Principle

Build Garden Companion as though a family will use it to document the same garden for the next thirty years.

Every database table, every API, every prompt, every workflow, and every line of code should contribute to preserving and understanding that living history.

Technology will change.

AI models will change.

Frameworks will change.

The garden's story should not.
