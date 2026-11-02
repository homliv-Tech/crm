import type { ComponentProps } from "react";

export default function Button({
  variant,
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & {
  variant: "primary" | "secondary" | "ghost" | "danger";
}) {
  const variants = {
    primary: "bg-emerald-800 text-white hover:bg-emerald-900 shadow-sm",
    secondary:
      "border border-stone-300 bg-white text-stone-800 hover:bg-stone-100",
    ghost: "text-stone-600 hover:bg-stone-100 hover:text-stone-900",
    danger: "border border-red-200 text-red-700 hover:bg-red-50",
  };
  return (
    <button
      type={type}
      className={`inline-flex min-h-10 shrink-0 cursor-pointer items-center justify-center gap-2 rounded-lg px-3 py-2 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-emerald-700 disabled:cursor-not-allowed disabled:opacity-45 ${variants[variant]} ${className}`}
      {...props}
    />
  );
}
