// Example decisions a team can load into an empty ledger to try the app.
export const SAMPLES = [
  {
    title: 'Postgres is the only datastore for services',
    statement: 'We will not use Redis or any second datastore in services. Sessions, queues and caches live in Postgres.',
    rationale: 'Two on-call incidents this year came from Redis failover. One system to operate, back up and audit.',
    tags: ['architecture', 'database'],
  },
  {
    title: 'REST for public APIs',
    statement: 'Public APIs are REST with OpenAPI specs. For external endpoints we will not use GraphQL.',
    rationale: 'Partners asked for generated clients, and our gateway rate limits per route.',
    tags: ['api'],
  },
  {
    title: 'Feature flags for every risky release',
    statement: 'Every change that touches checkout or billing ships behind a feature flag and is rolled out in stages.',
    rationale: 'A staged rollout caught the tax rounding bug at 5% of traffic.',
    tags: ['release'],
  },
  {
    title: 'No new npm dependency without review',
    statement: 'Adding a runtime dependency needs a second engineer to approve it on the work item first.',
    rationale: 'Supply chain risk, and the bundle grew 40% in one quarter.',
    tags: ['security', 'dependencies'],
  },
  {
    title: 'Support the last two major browser versions',
    statement: 'The last two major versions of Chrome, Firefox, Safari and Edge are supported. Internet Explorer is out of scope.',
    rationale: 'Under 0.3% of sessions come from anything older.',
    tags: ['frontend'],
  },
];
