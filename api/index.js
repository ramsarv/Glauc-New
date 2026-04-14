// Vercel serverless entry point.
// Vercel requires handlers in the /api directory; this re-exports
// the Express app from the actual server module.
export { default } from '../server/server.js';
