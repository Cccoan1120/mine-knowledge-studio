export async function verifyDisposableDatabase({ databaseUrl, createClient }) {
  let databaseName = ''
  try {
    databaseName = decodeURIComponent(new URL(databaseUrl).pathname.replace(/^\/+/, ''))
  } catch {
    throw new Error('Live database tests require an explicitly test-only database.')
  }
  if (!/(^|[_-])test($|[_-])/i.test(databaseName)) {
    throw new Error('Live database tests require an explicitly test-only database.')
  }

  const client = createClient()
  const [counts] = await client.$queryRawUnsafe(`
    SELECT
      (
        SELECT COUNT(*)::int
        FROM "User"
        WHERE "email" !~ '@mine-db[.]test$'
      ) AS "nonTestUsers",
      (
        SELECT COUNT(*)::int
        FROM "KnowledgeIndexJob" AS job
        LEFT JOIN "User" AS owner ON owner."id" = job."userId"
        WHERE owner."id" IS NULL OR owner."email" !~ '@mine-db[.]test$'
      ) AS "nonTestJobs"
  `)
  if (Number(counts?.nonTestUsers) || Number(counts?.nonTestJobs)) {
    throw new Error('Live database tests refuse a database containing non-test data.')
  }
  return client
}
