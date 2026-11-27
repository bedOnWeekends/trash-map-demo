import { identity } from "@/lib/server";
import Admin, { Login } from "@/components/admin";
export const dynamic = "force-dynamic";
export default async function AdminPage() {
  return (await identity("admin")) ? <Admin /> : <Login />;
}
