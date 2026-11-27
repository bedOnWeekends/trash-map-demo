"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { X } from "lucide-react";
import { memo, useRef, type ReactNode } from "react";
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
  const opener = useRef<HTMLElement | null>(null);
  return (
    <Dialog.Root open={open} onOpenChange={onOpenChange}>
      <Dialog.Portal>
        <Dialog.Overlay className="scrim" />
        <Dialog.Content
          onOpenAutoFocus={() => {
            opener.current =
              document.activeElement instanceof HTMLElement
                ? document.activeElement
                : null;
          }}
          onCloseAutoFocus={(event) => {
            if (opener.current?.isConnected) {
              event.preventDefault();
              opener.current.focus({ preventScroll: true });
            }
          }}
          inert={!open}
          className={sheet ? "dialog mobile-dialog" : "dialog"}
        >
          <DialogBody
            open={open}
            title={title}
            description={description}
            content={content}
            actions={actions}
          />
        </Dialog.Content>
      </Dialog.Portal>
    </Dialog.Root>
  );
}

// Keep the last open content readable until Radix finishes its CSS exit animation.
const DialogBody = memo(
  function DialogBody({
    title,
    description,
    content,
    actions,
  }: {
    open: boolean;
    title: string;
    description: string;
    content?: ReactNode;
    actions?: ReactNode;
  }) {
    return (
      <>
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
      </>
    );
  },
  (previous, next) =>
    !next.open ||
    (previous.title === next.title &&
      previous.description === next.description &&
      previous.content === next.content &&
      previous.actions === next.actions),
);
