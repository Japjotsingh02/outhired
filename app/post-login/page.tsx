import { redirect } from "next/navigation";
import { getServerSession } from "next-auth";
import { authOptions } from "@/server/security/authOptions";
import { getPostLoginPath } from "@/server/services/profile.service";

// Post-login landing point. The decision is made on the server: users who have
// never been onboarded go to /profile once; everyone else goes to the dashboard.
// This is the only place that redirects based on onboarding; direct navigation
// to any other page is never blocked.
export const dynamic = "force-dynamic";

export default async function PostLoginPage() {
  const session = await getServerSession(authOptions);
  if (!session?.user?.id) redirect("/login");
  redirect(await getPostLoginPath(session.user.id));
}
