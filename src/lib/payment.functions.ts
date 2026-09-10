import { createServerFn } from "@tanstack/react-start";
import { z } from "zod";

/**
 * Creates a CrystalPay invoice server-side (the cashier credentials never
 * reach the browser) and returns the hosted pay.crystalpay.io URL.
 */
export const createPayment = createServerFn({ method: "POST" })
  .inputValidator((d: { amount: number; redirectUrl?: string }) =>
    z
      .object({
        amount: z.number().positive().max(1_000_000),
        redirectUrl: z.string().url().max(300).optional(),
      })
      .parse(d),
  )
  .handler(async ({ data }) => {
    const auth_login = process.env["CRYSTALPAY_AUTH_NAME"];
    const auth_secret = process.env["CRYSTALPAY_AUTH_SECRET"];
    if (!auth_login || !auth_secret) throw new Error("payment_not_configured");

    const res = await fetch("https://api.crystalpay.io/v2/invoice/create/", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        auth_login,
        auth_secret,
        // The API also accepts these aliases; sending both keeps it compatible.
        auth_name: auth_login,
        amount: data.amount,
        amount_currency: "RUB",
        type: "purchase",
        lifetime: 60,
        description: `Пополнение баланса на ${data.amount}`,
        ...(data.redirectUrl ? { redirect_url: data.redirectUrl } : {}),
      }),
    });

    const body = (await res.json().catch(() => null)) as {
      error?: boolean;
      errors?: string[];
      url?: string;
      id?: string;
    } | null;

    if (!res.ok || !body || body.error || !body.url) {
      const reason = body?.errors?.join(", ") || `http_${res.status}`;
      throw new Error(`payment_failed: ${reason}`);
    }

    return { url: body.url, id: body.id ?? null };
  });
