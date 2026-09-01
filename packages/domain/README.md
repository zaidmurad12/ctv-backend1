# Domain Package

This package contains the pure business domain for CTV Platform.

It intentionally avoids:
- Prisma
- databases
- Redis
- BullMQ
- HTTP
- providers
- infrastructure dependencies

The package is organized around:
- entities
- value objects
- repository interfaces
- domain events
- domain errors
- shared types
