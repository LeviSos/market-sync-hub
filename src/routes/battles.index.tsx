import { createFileRoute, Link } from "@tanstack/react-router";
import { Swords } from "lucide-react";
import { useT } from "@/lib/i18n";

export const Route = createFileRoute("/battles/")({
  head: () => ({
    meta: [
      { title: "Case battles — coming soon — CaseForge" },
      {
        name: "description",
        content:
          "Case battles are being rebuilt. Open cases, forge contracts or upgrade meanwhile.",
      },
      { property: "og:title", content: "Case battles — coming soon — CaseForge" },
      {
        property: "og:description",
        content: "Case battles are being rebuilt and will be back shortly.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary_large_image" },
    ],
  }),
  component: BattlesPage,
});

function BattlesPage() {
  const t = useT();
  return (
    <main className="mx-auto max-w-3xl px-4 py-20">
      <div className="panel flex flex-col items-center gap-4 p-10 text-center">
        <Swords className="size-10 text-primary" />
        <h1 className="font-display text-3xl font-bold tracking-tight">{t("battles.title")}</h1>
        <p className="max-w-md text-sm text-muted-foreground">{t("battles.lead")}</p>
        <div className="mt-2 flex flex-wrap justify-center gap-2">
          <Link
            to="/"
            className="rounded-md bg-primary px-4 py-2 font-display text-sm font-bold uppercase text-primary-foreground transition-opacity hover:opacity-90"
          >
            {t("battles.toCases")}
          </Link>
          <Link
            to="/upgrade"
            className="rounded-md border border-border px-4 py-2 font-display text-sm font-bold uppercase transition-colors hover:bg-surface"
          >
            {t("battles.toUpgrade")}
          </Link>
        </div>
      </div>
    </main>
  );
}
