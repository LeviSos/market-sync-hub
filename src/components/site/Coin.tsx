import { useCurrency } from "@/lib/currency";

/** Yellow hexagonal site coin — the only currency mark used in the app. */
export function Coin({ className = "size-[1em]" }: { className?: string }) {
  return (
    <svg viewBox="0 0 24 24" aria-hidden="true" className={`inline-block shrink-0 ${className}`}>
      <defs>
        <linearGradient id="coin-face" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#ffe27a" />
          <stop offset="55%" stopColor="#f5c024" />
          <stop offset="100%" stopColor="#c98a06" />
        </linearGradient>
      </defs>
      <polygon points="12,1.6 21,6.8 21,17.2 12,22.4 3,17.2 3,6.8" fill="url(#coin-face)" />
      <polygon
        points="12,4 18.6,7.8 18.6,16.2 12,20 5.4,16.2 5.4,7.8"
        fill="none"
        stroke="#8a5c00"
        strokeOpacity="0.45"
        strokeWidth="1"
      />
      <path d="M12 7.2l3.1 3.3h-1.9v3h-2.4v-3H8.9L12 7.2z" fill="#7a4f00" fillOpacity="0.85" />
      <path d="M8.9 15.4h6.2v1.5H8.9z" fill="#7a4f00" fillOpacity="0.85" />
    </svg>
  );
}

/**
 * Every price/balance in the app: [yellow coin] 855.00
 * The number formatting follows the selected language, the coin never changes.
 */
export function Price({
  value,
  className = "",
  iconClass = "size-[0.95em]",
}: {
  value: number | string | null | undefined;
  className?: string;
  iconClass?: string;
}) {
  const { format } = useCurrency();
  return (
    <span className={`inline-flex items-center gap-1 whitespace-nowrap ${className}`}>
      <Coin className={iconClass} />
      {format(value)}
    </span>
  );
}
