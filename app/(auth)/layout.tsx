import type { Metadata } from "next";
import Header from "@/components/header";
import Footer from "@/components/footer";
import { createClient } from "@/lib/supabase/server";
import { redirect } from "next/navigation";
export const metadata: Metadata = {
  title: "Solvio — Smart finance for humans",
};

export default async function MarketingLayout({ children }: { children: React.ReactNode }) {
  const supabase = await createClient();
  const { data: { user } } = await supabase.auth.getUser();

  if (user) {
    redirect("/welcome");
  }

  return (
    <div className="flex min-h-svh flex-col bg-background text-foreground">
      <Header />
      <main className="flex-1">{children}</main>
      <Footer />
    </div>
  );
}
