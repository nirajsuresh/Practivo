import { cn } from "@/lib/utils";

type BrandWordmarkProps = {
  className?: string;
  /** Default ~nav height; lg for auth hero and footer */
  size?: "md" | "lg";
  /** White lockup on dark overlays (e.g. landing hero, auth left panel). */
  inverse?: boolean;
};

const rasterHeights = {
  md: "h-9 sm:h-10",
  lg: "h-[2.65rem] sm:h-12 md:h-[3.35rem]",
} as const;

export function BrandWordmark({ className, size = "md", inverse = false }: BrandWordmarkProps) {
  return (
    <img
      src="/images/practivo-wordmark.png"
      alt="Practivo"
      className={cn("w-auto h-auto max-w-none", rasterHeights[size], className)}
      style={inverse ? { filter: "brightness(0) invert(1)" } : undefined}
    />
  );
}
