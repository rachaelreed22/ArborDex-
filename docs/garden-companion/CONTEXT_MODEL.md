# Garden Companion Context Model

The Mental Model of a Living Garden

Version: 1.0

## Purpose

This document defines how Garden Companion understands the world.

It is not a database schema.

It is not an API specification.

It is the conceptual model that should guide:

- Database design
- AI reasoning
- Prompt engineering
- Feature development
- User experience
- Future integrations

Everything inside Garden Companion should fit somewhere within this model.

If something cannot be connected to this model, reconsider whether it belongs.

## Foundational Principle

Garden Companion does not think in terms of screens.

It does not think in terms of database tables.

It thinks in terms of relationships.

Everything exists because it relates to something else.

Understanding emerges from those relationships.

## The User

The gardener is the center of the system.

Garden Companion exists to help one person (or one household) understand and care for one or more living spaces over many years.

Garden Companion should learn:

- Goals
- Gardening experience
- Preferences
- Available time
- Physical limitations
- Favorite plants
- Communication style
- Property history

The user is not just using Garden Companion.

Garden Companion is learning how to better support the user.

## The Property

Everything happens somewhere.

Every garden belongs to a property.

A property may include:

- Front yard
- Backyard
- Side yard
- Orchard
- Woodland
- Meadow
- Pond
- Greenhouse
- Patio
- Raised beds
- Containers
- Indoor plants

A property has characteristics.

Examples:

- USDA Hardiness Zone
- Climate
- Elevation
- Soil types
- Irrigation systems
- Shade patterns
- Wind exposure
- Wildlife
- Microclimates

Garden Companion should understand the property before attempting to understand individual plants.

## Spaces

Properties contain spaces.

Examples:

- Vegetable Garden
- Pollinator Garden
- Herb Garden
- Rose Garden
- Orchard
- Native Prairie
- Woodland Edge

Spaces provide context.

Plants are rarely isolated.

## Garden Beds

Garden beds organize plants into meaningful groups.

A bed has:

- Shape
- Size
- Soil
- Sun exposure
- Drainage
- Plant population
- History

Beds evolve over time.

Garden Companion should remember every change.

## Plants

Plants are living individuals.

Every plant has:

- Identity
- Species
- Cultivar
- Nickname (optional)
- Location
- Planting date
- Age
- Health
- Growth stage
- Relationships
- History
- Timeline
- Photos
- Observations
- Tasks
- Memories

No two plants are truly identical.

Garden Companion should treat each one as an individual.

## Trees

Trees follow the same principles as plants but require deeper historical tracking.

Examples:

- Growth measurements
- Structural observations
- Canopy changes
- Storm damage
- Risk assessments
- Long-term health trends

Trees often become multi-decade relationships.

Their history should never be simplified.

## Living Things

Garden Companion should eventually understand more than plants.

Future entities include:

- Pollinators
- Birds
- Beneficial insects
- Soil organisms
- Pets
- Wildlife

Everything living contributes context.

## Events

Events are the foundation of memory.

Examples:

- Planted
- Watered
- Pruned
- Bloomed
- Harvested
- Diagnosed
- Fertilized
- Moved
- Tagged
- Observed
- Photographed

Every event should answer:

- What happened?
- When?
- Where?
- Why?
- Who recorded it?

Events are permanent.

They create history.

## Observations

Observations differ from events.

Events happen.

Observations are noticed.

Examples:

- Leaves curling
- Flower opening
- First bee of spring
- Fruit ripening
- Bird nesting
- Soil drying
- Temperature stress

Observations build understanding.

## Tasks

Tasks connect intention with action.

Every task should reference:

- What needs attention
- Why
- Priority
- Suggested timing
- Related plants
- Related history

Completed tasks become historical events.

## Conversations

Conversations are not isolated chats.

Every conversation becomes part of Garden Companion's understanding.

Conversations may reveal:

- Preferences
- Goals
- Problems
- Ideas
- Questions
- Experiences
- Future plans

Important information should become structured knowledge whenever appropriate.

## Photos

Photos are observations frozen in time.

A photo should always connect to:

- Plant
- Tree
- Garden Bed
- Property
- Event
- Conversation
- Season
- Timeline

Photos become more valuable as their historical context grows.

## Weather

Weather is context, not just data.

Garden Companion should understand:

- Rainfall
- Heat
- Cold
- Humidity
- Wind
- Storms
- Frost
- Growing degree days

Weather should explain garden outcomes whenever possible.

## Time

Time is fundamental.

Everything should exist within a timeline.

Garden Companion should understand:

- Today
- Yesterday
- Last week
- Last season
- Last year
- Five years ago

Time transforms isolated facts into meaningful stories.

## Relationships

Garden Companion should always ask:

What is this connected to?

Examples:

- Plant -> Garden Bed
- Plant -> Pollinator
- Tree -> Shade Pattern
- Weather -> Disease
- Conversation -> Observation
- Task -> Event
- Photo -> Timeline

Nothing important should exist in isolation.

## Knowledge

Garden Companion should distinguish between:

Universal knowledge and property-specific knowledge.

Universal:

"Tomatoes prefer full sun."

Property-specific:

"Tomatoes consistently perform better in the eastern raised bed."

Property knowledge is often more valuable.

## Memory

Memory exists on four levels.

- Immediate: Current conversation.
- Seasonal: This growing season.
- Historical: Everything previously recorded.
- Generational: Knowledge accumulated across many years and potentially multiple caretakers.

Garden Companion should operate across all four levels simultaneously.

## Stewardship

The ultimate purpose of every entity is stewardship.

Garden Companion should encourage:

- Understanding
- Care
- Conservation
- Learning
- Observation
- Respect
- Long-term thinking

Stewardship is the outcome.

Memory is the mechanism.

## Intelligence Flow

Whenever responding, Garden Companion should think in this order:

1. Who is asking?
2. Which property?
3. Which space?
4. Which garden bed?
5. Which plant or tree?
6. What history exists?
7. What relationships exist?
8. What observations matter?
9. What environmental context exists?
10. What botanical knowledge applies?
11. What action best supports stewardship?

This order should guide prompts, APIs, and future reasoning systems.

## The Living Graph

Garden Companion should internally treat the garden as a living network rather than isolated records.

Every new observation strengthens the graph.

Every conversation enriches the graph.

Every season expands the graph.

Over time, Garden Companion should understand not only the individual parts but the relationships between them.

Understanding emerges from connections.

## Final Principle

Garden Companion is not building a database of plants.

It is building a living model of a person's relationship with the natural world.

Every entity, every relationship, every event, every conversation, every observation, and every memory should contribute to a single goal:

Helping the gardener understand, care for, and preserve the living world around them, one season at a time.
