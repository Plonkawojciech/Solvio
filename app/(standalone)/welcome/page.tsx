"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";
import { Button } from "@/components/ui/button";
import { Progress } from "@/components/ui/progress";
import {
  Card,
  CardContent,
  CardDescription,
  CardFooter,
  CardHeader,
  CardTitle,
} from "@/components/ui/card";
import { CheckCircle2 } from "lucide-react";

export default function WelcomePage() {
  const router = useRouter();
  const [value, setValue] = useState(0);

  useEffect(() => {
    const reduce =
      typeof window !== "undefined" &&
      window.matchMedia("(prefers-reduced-motion: reduce)").matches;

    if (reduce) {
      setValue(100);
      return;
    }

    const DURATION = 1000;
    const start = performance.now();
    let raf = requestAnimationFrame(function loop(t) {
      const pct = Math.min(100, ((t - start) / DURATION) * 100);
      setValue(pct);
      pct < 100 ? (raf = requestAnimationFrame(loop)) : router.replace("/dashboard");
    });
    return () => cancelAnimationFrame(raf);
  }, [router]);

  return (
    <main className="min-h-[100svh] bg-background text-foreground grid place-items-center p-6" aria-live="polite">
      <Card className="w-[min(640px,92vw)]">
        <CardHeader className="items-center text-center space-y-3">
          <div className="inline-flex h-12 w-12 items-center justify-center rounded-full border text-primary">
            <CheckCircle2 className="h-6 w-6" aria-hidden="true" />
          </div>

          <CardTitle className="text-balance text-3xl sm:text-4xl">
            Welcome to <span className="text-primary">Solvio</span>
          </CardTitle>
          <CardDescription>In a moment you’ll be redirected to the dashboard.</CardDescription>
        </CardHeader>

        <CardContent>
          <Progress value={value} className="h-2" aria-label="Redirect progress" />
        </CardContent>

        <CardFooter className="justify-center">
          <Button variant="secondary" onClick={() => router.replace("/dashboard")}>
            Go now
          </Button>
        </CardFooter>
      </Card>
    </main>
  );
}
