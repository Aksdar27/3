import dotenv from 'dotenv';

// Load local env files before any module reads process.env.
// `.env.local` takes precedence over `.env`; existing process.env vars (e.g. from
// the hosting platform) are never overridden.
dotenv.config({ path: ['.env.local', '.env'] });
