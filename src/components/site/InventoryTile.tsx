import { rarityColor } from "@/lib/rarity";
import { useSkinImage } from "@/hooks/useSkinImages";
import { Price } from "@/components/site/Coin";

export type InvRow = {
  id: string;
  value: number;
  item: { name: string; image_url: string | null; rarity: string };
};

/** Selectable skin card used by the upgrader and the contract forge. */
export function InventoryTile({
  row,
  on,
  onClick,
}: {
  row: InvRow;
  on: boolean;
  onClick: () => void;
}) {
  const src = useSkinImage(row.item.name, row.item.image_url);
  const color = rarityColor(row.item.rarity);
  return (
    <button
      onClick={onClick}
      className="relative overflow-hidden rounded-lg border p-2 text-left transition-transform hover:-translate-y-0.5"
      style={{
        borderColor: on ? "var(--primary)" : `color-mix(in oklch, ${color} 45%, transparent)`,
        background: on ? "color-mix(in oklch, var(--primary) 12%, transparent)" : undefined,
      }}
    >
      <span
        className="pointer-events-none absolute inset-x-0 -top-8 h-16 blur-2xl"
        style={{ background: `color-mix(in oklch, ${color} 40%, transparent)` }}
      />
      <div className="relative flex h-14 items-center justify-center">
        {src ? (
          <img
            src={src}
            alt=""
            loading="lazy"
            className="max-h-full max-w-full object-contain drop-shadow"
          />
        ) : (
          <span className="text-2xl opacity-30">✦</span>
        )}
      </div>
      <p className="relative mt-1 truncate text-[11px]">{row.item.name}</p>
      <p className="relative text-[11px] font-semibold text-primary">
        {<Price value={row.value} />}
      </p>
      <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: color }} />
    </button>
  );
}
