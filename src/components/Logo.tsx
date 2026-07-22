import Image from "next/image";

// The mark and wordmark were pasted into several files, each with its own copy of
// the same chat-bubble path. One source.
//
// The mark is the real brand asset (public/logo1.png) — a transparent PNG, so it's
// rendered bare with no tile behind it: it already IS the full colourful bubble,
// and a gradient tile would double up. next/image (optimized) resizes it, so a
// 32px sidebar mark isn't the 1.4MB original.
// The mark has transparent padding baked into the PNG, so the visible glyph is
// noticeably smaller than its box — these run larger than a typical icon size to
// compensate.
const SIZES = {
  sm: { px: 40, text: "text-sm" },
  md: { px: 48, text: "text-base" },
  lg: { px: 68, text: "text-lg" },
} as const;

export function LogoMark({ size = "sm" }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <Image
      src="/logo1.png"
      alt="Instasuite"
      width={s.px}
      height={s.px}
      priority
      className="flex-shrink-0"
      style={{ width: s.px, height: s.px }}
    />
  );
}

export default function Logo({
  size = "sm",
  subtitle,
}: {
  size?: keyof typeof SIZES;
  subtitle?: string;
}) {
  const s = SIZES[size];
  return (
    <div className="flex items-center gap-2.5">
      <LogoMark size={size} />
      <div className="min-w-0">
        <span className={`block font-bold tracking-tight text-[var(--text-1)] ${s.text}`}>
          Instasuite
        </span>
        {subtitle && (
          <span className="block text-[10px] uppercase tracking-wider text-[var(--text-5)]">
            {subtitle}
          </span>
        )}
      </div>
    </div>
  );
}
