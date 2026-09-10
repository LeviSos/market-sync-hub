import { rarityColor, RARITY_LABEL, isTopDrop, type Rarity } from "@/lib/rarity";
import { useSkinImage } from "@/hooks/useSkinImages";
import { Price } from "@/components/site/Coin";


type Props = {
  name: string;
  image: string | null;
  rarity: string;
  price?: number | null;
  chance?: number | null;
  compact?: boolean;
};

export function ItemTile({ name, image, rarity, price, chance, compact }: Props) {
  const color = rarityColor(rarity);
  const src = useSkinImage(name, image);
  
  const top = isTopDrop(name, rarity);
  return (
    <div
      className="group relative overflow-hidden rounded-lg border bg-surface/70 p-3 transition-transform duration-200 hover:-translate-y-1"
      style={{
        borderColor: top ? "#f5c024" : `color-mix(in oklch, ${color} 45%, transparent)`,
        boxShadow: top ? "0 0 22px -4px rgba(245,192,36,0.55)" : undefined,
      }}
    >
      <div
        className="pointer-events-none absolute inset-x-0 -top-10 h-24 blur-2xl"
        style={{ background: `color-mix(in oklch, ${color} 40%, transparent)` }}
      />
      {/* Chance badge is pinned top-left so it never sits over the art or name. */}
      {chance != null && (
        <span className="absolute left-1.5 top-1.5 z-10 rounded bg-background/85 px-1.5 py-0.5 text-[10px] font-semibold text-muted-foreground">
          {chance < 0.01 ? "<0.01" : chance.toFixed(2)}%
        </span>
      )}
      {/* The "TOP DROP" badge exists only once, pinned at the top of the live
          feed — never on individual skins inside a case. */}
      <div className="relative flex aspect-[4/3] items-center justify-center">
        {src ? (
          <img
            src={src}
            alt={name}
            loading="lazy"
            className="max-h-full max-w-full object-contain drop-shadow-lg"
          />
        ) : (
          <span className="text-4xl opacity-30">✦</span>
        )}
      </div>
      <div className="relative mt-2 space-y-0.5">
        {!compact && (
          <p className="truncate text-[11px] uppercase tracking-wide" style={{ color }}>
            {RARITY_LABEL[rarity as Rarity] ?? rarity}
          </p>
        )}
        <p className="truncate text-sm font-medium">{name}</p>
        {price != null && (
          <p className="text-sm font-semibold text-primary">
            <Price value={price} />
          </p>
        )}
      </div>
      <span className="absolute inset-x-0 bottom-0 h-0.5" style={{ background: color }} />
    </div>
  );
}
