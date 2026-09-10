import { useState } from "react";
import { useMutation } from "@tanstack/react-query";
import { toast } from "sonner";
import { Plus } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { createPayment } from "@/lib/payment.functions";
import { Price } from "@/components/site/Coin";
import { useT } from "@/lib/i18n";

const AMOUNTS = [100, 250, 500, 1000];

export function TopUpButton() {
  const t = useT();
  const [open, setOpen] = useState(false);
  const [amount, setAmount] = useState(250);

  const pay = useMutation({
    mutationFn: async (value: number) => {
      const res = await createPayment({
        data: { amount: value, redirectUrl: window.location.origin },
      });
      return res.url;
    },
    onSuccess: (url) => {
      toast.success(t("topup.redirect"));
      window.location.href = url;
    },
    onError: () => toast.error(t("topup.error")),
  });

  const valid = Number.isFinite(amount) && amount > 0;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogTrigger className="inline-flex items-center gap-1.5 rounded-md bg-primary px-3 py-2 font-display text-[13px] font-bold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90">
        <Plus className="size-4" strokeWidth={3} /> {t("topup.trigger")}
      </DialogTrigger>
      <DialogContent className="sm:max-w-sm">
        <DialogHeader>
          <DialogTitle className="font-display">{t("topup.title")}</DialogTitle>
          <DialogDescription>{t("topup.lead")}</DialogDescription>
        </DialogHeader>

        <div className="grid grid-cols-2 gap-2">
          {AMOUNTS.map((a) => (
            <button
              key={a}
              onClick={() => setAmount(a)}
              className={
                amount === a
                  ? "rounded-md border border-primary bg-primary px-4 py-3 font-display text-sm font-bold text-primary-foreground"
                  : "rounded-md border bg-surface px-4 py-3 font-display text-sm font-bold transition-colors hover:bg-primary hover:text-primary-foreground"
              }
            >
              <Price value={a} />
            </button>
          ))}
        </div>

        <label className="mt-1 block text-xs font-semibold text-muted-foreground">
          {t("topup.custom")}
          <input
            type="number"
            min={1}
            value={Number.isFinite(amount) ? amount : ""}
            onChange={(e) => setAmount(Number(e.target.value))}
            className="mt-1 w-full rounded-md border border-border bg-background px-3 py-2 text-sm text-foreground"
          />
        </label>

        <button
          onClick={() => pay.mutate(amount)}
          disabled={!valid || pay.isPending}
          className="mt-2 w-full rounded-md bg-primary px-4 py-3 font-display text-sm font-bold uppercase tracking-wide text-primary-foreground transition-opacity hover:opacity-90 disabled:opacity-50"
        >
          {pay.isPending ? t("topup.creating") : t("topup.go")}
        </button>
      </DialogContent>
    </Dialog>
  );
}
