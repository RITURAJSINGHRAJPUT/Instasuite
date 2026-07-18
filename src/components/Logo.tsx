import { MessageSquare } from "lucide-react";

// The mark and wordmark were pasted into five files (login, auth/reset, landing,
// inbox, AppNav), each with its own copy of the same chat-bubble path. One source.
const SIZES = {
  sm: { tile: "h-8 w-8 rounded-lg", icon: 16, text: "text-sm" },
  md: { tile: "h-10 w-10 rounded-xl", icon: 20, text: "text-base" },
  lg: { tile: "h-14 w-14 rounded-2xl", icon: 26, text: "text-lg" },
} as const;

export function LogoMark({ size = "sm" }: { size?: keyof typeof SIZES }) {
  const s = SIZES[size];
  return (
    <div
      className={`flex flex-shrink-0 items-center justify-center ${s.tile}`}
      style={{ background: "var(--brand-gradient)" }}
    >
      <MessageSquare size={s.icon} color="#fff" strokeWidth={2.5} />
    </div>
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
