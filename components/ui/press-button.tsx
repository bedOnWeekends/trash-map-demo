import type { ComponentPropsWithRef } from "react";

// The native button owns the stable hit area and focus ring.
export function PressButton({ children, className = "", ...props }: ComponentPropsWithRef<"button">) {
  return (
    <button {...props} className={("press-button " + className).trim()}>
      <span className="press-face">{children}</span>
    </button>
  );
}
