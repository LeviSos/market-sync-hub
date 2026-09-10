import { createFileRoute } from "@tanstack/react-router";
import { LegalPage } from "@/components/site/LegalPage";

export const Route = createFileRoute("/cookie-policy")({
  head: () => ({
    meta: [
      { title: "Cookie Policy — CaseForge" },
      {
        name: "description",
        content:
          "Cookie Policy for CaseForge: which cookies we use, third-party cookies and how to manage them.",
      },
      { property: "og:title", content: "Cookie Policy — CaseForge" },
      {
        property: "og:description",
        content:
          "Cookie Policy for CaseForge: which cookies we use, third-party cookies and how to manage them.",
      },
      { property: "og:type", content: "website" },
      { name: "twitter:card", content: "summary" },
    ],
  }),
  component: () => <LegalPage doc="cookies" />,
});
