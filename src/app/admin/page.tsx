import { redirect } from "next/navigation";
import { getCurrentUser } from "@/lib/auth/session";
import { FINANCE_HOME_PATH } from "@/types/roles";

export default async function AdminIndexPage() {
  const user = await getCurrentUser();
  // The accountant has no general dashboard - finance is their home.
  if (user?.role === "finance") redirect(FINANCE_HOME_PATH);
  redirect("/admin/dashboard");
}
