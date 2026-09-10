import { createFileRoute, redirect } from "@tanstack/react-router";

export const Route = createFileRoute("/battles/$id")({
  // Battles are temporarily disabled — send every battle link to the notice.
  beforeLoad: () => {
    throw redirect({ to: "/battles" });
  },
  component: () => null,
});
