"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { type ReactNode } from "react";
// shadcn/ui dialog composition, styled with the campus tokens.
export function ConfirmDialog({
  open,
  onOpenChange,
  title,
  description,
  content,
  children: actions,
  sheet = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  children?: ReactNode;
  content?: ReactNode;
  sheet?: boolean;
}) {
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content className={sheet ? "dialog mobile-dialog" : "dialog"}>
          <Dialog.Close className="close" aria-label="닫기">
            <X size={18} />
          </Dialog.Close>
          <Dialog.Title>{title}</Dialog.Title>
          <Dialog.Description>{description}</Dialog.Description>
          {content}
          {actions && (
            <div
              className="dialog-actions"
              onTouchEnd={(event) => {
                // Touch browsers can dispatch a button click for a tap in the gap.
                const { clientX, clientY } = event.changedTouches[0];
                if (
                  document.elementFromPoint(clientX, clientY) ===
                  event.currentTarget
                )
                  event.preventDefault();
              }}
            >
              {actions}
            </div>
          )}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
