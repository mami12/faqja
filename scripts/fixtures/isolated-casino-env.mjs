// Test-only bootstrap. Production connection strings cannot be used by this suite.
process.env.DATABASE_URL='postgresql://unused:unused@127.0.0.1:1/casino_test';
process.env.JWT_SECRET='isolated-original-wallet-test-secret-only';
