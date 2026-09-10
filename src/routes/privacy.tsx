import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

export const Route = createFileRoute("/privacy")({
  head: () => ({
    meta: [
      { title: "Privacy Policy — CaseForge" },
      {
        name: "description",
        content:
          "Privacy Policy for CaseForge: what data we collect, how we use it, third-party services and your rights.",
      },
      { property: "og:title", content: "Privacy Policy — CaseForge" },
      {
        property: "og:description",
        content:
          "Privacy Policy for CaseForge: what data we collect, how we use it, third-party services and your rights.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage doc="privacy" />,
});
