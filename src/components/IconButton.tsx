import type { ButtonHTMLAttributes } from "react";

export default function IconButton({
  className = "",
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement>) {
  return (
    <button
      className={`flex h-8 w-8 items-center justify-center rounded-full text-muted hover:bg-pantry-strip hover:text-ink transition-colors ${className}`}
      {...props}
    />
  );
}
