/** Local launcher: clears an inherited DATABASE_URL so the value in .env wins. */
delete process.env.DATABASE_URL;
await import('../server/index.mjs');