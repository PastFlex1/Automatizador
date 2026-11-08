import { defineConfig } from "drizzle-kit";
import * as dotenv from "dotenv";

dotenv.config();

const sqlHost = process.env.SQL_HOST;
const sqlDbName = process.env.SQL_DB_NAME;
const user = process.env.SQL_ADMIN_USER;
const password = process.env.SQL_ADMIN_PASSWORD;

if (!sqlHost) {
  throw new Error("SQL_HOST must be set in environment variables.");
}
if (!sqlDbName) {
  throw new Error("SQL_DB_NAME must be set in environment variables.");
}
if (!user) {
  throw new Error("SQL_ADMIN_USER must be set in environment variables.");
}
if (!password) {
  throw new Error("SQL_ADMIN_PASSWORD must be set in environment variables.");
}

process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";

export default defineConfig({
  schema: "./src/db/schema.ts",
  out: "./drizzle",
  dialect: "postgresql",
  schemaFilter: ["public"],
  dbCredentials: {
    url: `postgresql://postgres.vidtotonxlndgmfdgrjz:Adonistequieromuchonoolvidesquesoytupadre@aws-0-us-east-1.pooler.supabase.com:6543/postgres?sslmode=require`,
  },
  verbose: true,
});
