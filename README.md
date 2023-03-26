# Spec Query Client

JavaScript client for querying Spec's shared tables.

## Installation

```bash
$ npm install @spec.dev/query
```

## Quickstart

```typescript
import { SpecQueryClient } from '@spec.dev/query'

// Client to query Spec's shared tables.
const client = new SpecQueryClient({ 
    apiKey: process.env.PROJECT_API_KEY
})

// Basic query for a specific block.
const { data } = await client.query('ethereum.blocks', {
    where: { number: 1000000 }
})

// Streaming query for all lens profiles.
await client.stream('lens.profiles', {}, async batch => {
    // batches of 1000 records.
})
```

## License

MIT