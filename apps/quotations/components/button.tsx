import type { ComponentProps } from "react";

export default function Button({
  variant,
  className = "",
  type = "button",
  ...props
}: ComponentProps<"button"> & {
  variant: "primary" | "secondary" | "ghost" | "danger";
}) {
  return (
    <button
      type={type}
      className={`quote-button quote-button-${variant} ${className}`}
      {...props}
    />
  );
}
