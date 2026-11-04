import { Button, Group, Modal, Stack, Text } from "@mantine/core";
import { useRef, useState, type ReactNode } from "react";

export interface ConfirmationRequest {
  title: string;
  children: ReactNode;
  labels: { confirm: string; cancel: string };
  onConfirm: () => void;
  confirmProps?: { color?: string };
  zIndex?: number;
}

/** One confirmation owned by this editor, independent of other WordPress React roots. */
export function useLocalConfirmation(defaultZIndex = 100010) {
  const [request, setRequest] = useState<ConfirmationRequest | null>(null);
  const pending = useRef<ConfirmationRequest | null>(null);
  const close = () => { pending.current = null; setRequest(null); };
  const confirm = () => {
    const current = pending.current;
    close();
    current?.onConfirm();
  };
  const openConfirmModal = (next: ConfirmationRequest) => {
    if (pending.current) return;
    pending.current = next;
    setRequest(next);
  };
  const confirmation = <Modal opened={request !== null} onClose={close} title={request?.title}
    zIndex={request?.zIndex ?? defaultZIndex} centered size="sm" closeOnClickOutside={false} closeOnEscape={false}
    onFocusCapture={event => event.target.setAttribute("data-mantine-stop-propagation", "true")}
    onKeyDown={event => { event.stopPropagation(); if (event.key === "Escape") { event.preventDefault(); close(); } }}>
    {request && <Stack>
      {typeof request.children === "string" ? <Text size="sm">{request.children}</Text> : request.children}
      <Group justify="flex-end">
        <Button variant="default" onClick={close}>{request.labels.cancel}</Button>
        <Button color={request.confirmProps?.color ?? "red"} onClick={confirm}>{request.labels.confirm}</Button>
      </Group>
    </Stack>}
  </Modal>;
  return { openConfirmModal, confirmation, confirming: request !== null };
}
