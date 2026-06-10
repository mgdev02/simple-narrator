import { cn } from "@/lib/utils";

const sizeClasses = {
  sm: "size-9 rounded-lg",
  md: "size-16 rounded-2xl",
} as const;

interface AppLogoProps {
  size?: keyof typeof sizeClasses;
  className?: string;
}

export function AppLogo({ size = "md", className }: AppLogoProps) {
  return (
    <div
      className={cn(
        "flex shrink-0 items-center justify-center overflow-hidden bg-primary/10 shadow-lg shadow-primary/10",
        sizeClasses[size],
        className,
      )}
    >
      <img
        src="/icon.png"
        alt=""
        className="size-full object-cover"
        draggable={false}
      />
    </div>
  );
}
