/**
 * Moves a user to the Free or Pro plan by hand (no payments yet).
 *
 *   npx tsx --conditions=react-server --env-file=.env.local scripts/set-plan.ts <email> PRO|FREE
 *
 * (`npm run plan:set -- <email> PRO|FREE` does the same.) Prints one confirmation line and nothing else.
 */
import { prisma } from "@/server/db";
import { setUserPlan } from "@/server/repositories/usage.repo";

async function main() {
  const [email, planArg] = process.argv.slice(2);
  const plan = planArg?.toUpperCase();
  if (!email || (plan !== "PRO" && plan !== "FREE")) {
    console.error("Usage: npx tsx scripts/set-plan.ts <email> PRO|FREE");
    process.exit(1);
  }
  const result = await setUserPlan(email.trim(), plan, new Date());
  if (result.count === 0) {
    console.error(`No user found for ${email}.`);
    process.exit(1);
  }
  console.log(`${email}: plan set to ${plan}.`);
}

main()
  .catch((err) => {
    console.error("Failed:", err instanceof Error ? err.message : String(err));
    process.exit(1);
  })
  .finally(() => prisma.$disconnect());
