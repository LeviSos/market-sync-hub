import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

export const Route = createFileRoute("/terms")({
  head: () => ({
    meta: [
      { title: "Terms of Service — CaseForge" },
      {
        name: "description",
        content:
          "Terms of Service for CaseForge: 18+ rules, Steam OpenID sign-in, virtual items, payments and cancellation policy.",
      },
      { property: "og:title", content: "Terms of Service — CaseForge" },
      {
        property: "og:description",
        content:
          "Terms of Service for CaseForge: 18+ rules, Steam OpenID sign-in, virtual items, payments and cancellation policy.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage doc="terms" />,
});
