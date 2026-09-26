import { AdminNav } from "@/components/admin-nav";
import { requireAdmin } from "@/server/queries";
export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  await requireAdmin();
  return (
    <>
      <AdminNav />
      {children}
    </>
  );
}
