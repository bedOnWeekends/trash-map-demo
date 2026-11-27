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
  children,
  sheet = false,
}: {
  open: boolean;
  onOpenChange: (v: boolean) => void;
  title: string;
  description: string;
  children: ReactNode;
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
          {children}
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}
