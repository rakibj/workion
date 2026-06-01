import React, { ReactNode, useCallback, useEffect, useRef } from "react";
import {
  ActionIcon,
  Center,
  Loader,
  Popover,
  Button,
  useMantineColorScheme,
} from "@mantine/core";
import { useDisclosure, useWindowEvent } from "@mantine/hooks";
import { Suspense } from "react";
import { useTranslation } from "react-i18next";

const Picker = React.lazy(async () => {
  const [pickerModule, dataModule] = await Promise.all([
    import("@slidoapp/emoji-mart-react"),
    import("@slidoapp/emoji-mart-data"),
  ]);
  const PickerComp = pickerModule.default;
  const data = dataModule.default;
  // Never re-render once mounted. The library calls instance.current.update()
  // during render which throws if the web component isn't fully initialised yet.
  return {
    default: React.memo(
      (props: any) => <PickerComp {...props} data={data} />,
      () => true,
    ),
  };
});

export interface EmojiPickerInterface {
  onEmojiSelect: (emoji: any) => void;
  icon: ReactNode;
  removeEmojiAction: () => void;
  readOnly: boolean;
  actionIconProps?: {
    size?: string;
    variant?: string;
    c?: string;
    tabIndex?: number;
  };
}

function EmojiPicker({
  onEmojiSelect,
  icon,
  removeEmojiAction,
  readOnly,
  actionIconProps,
}: EmojiPickerInterface) {
  const { t } = useTranslation();
  const [opened, handlers] = useDisclosure(false);
  const { colorScheme } = useMantineColorScheme();

  // Use plain refs (not state) so mounting the dropdown doesn't cause a
  // re-render. A re-render while Picker is mounted would call
  // instance.current.update(props) inside @slidoapp/emoji-mart-react's render
  // function — a side-effectful call that can throw and crash the page.
  const targetRef = useRef<HTMLElement | null>(null);
  const dropdownRef = useRef<HTMLDivElement | null>(null);

  // Custom click-outside: reads refs directly in the effect so no state
  // updates (and therefore no re-renders) are needed.
  useEffect(() => {
    if (!opened) return;
    const listener = (event: MouseEvent | TouchEvent) => {
      const target = (event as MouseEvent).target as Node | null;
      if (!target || !document.body.contains(target)) return;

      const path = (event as MouseEvent).composedPath?.() ?? [];
      const insideTarget =
        !!targetRef.current && path.includes(targetRef.current);
      const insideDropdown =
        !!dropdownRef.current && path.includes(dropdownRef.current);

      if (!insideTarget && !insideDropdown) {
        handlers.close();
      }
    };
    document.addEventListener("mousedown", listener);
    document.addEventListener("touchstart", listener as EventListener);
    return () => {
      document.removeEventListener("mousedown", listener);
      document.removeEventListener("touchstart", listener as EventListener);
    };
  }, [opened, handlers]);

  // emoji-mart's built-in autoFocus calls .focus() without preventScroll,
  // scrolling every scrollable ancestor. Poll the shadow root and focus with
  // preventScroll instead.
  useEffect(() => {
    if (!opened || !dropdownRef.current) return;
    let cancelled = false;
    let rafId = 0;
    let boundInput: HTMLInputElement | null = null;
    const stopTreeKeydown = (event: KeyboardEvent) => {
      if (event.key === "Escape") return;
      event.stopPropagation();
    };
    const tryFocus = (attempts: number) => {
      if (cancelled) return;
      const pickerEl = dropdownRef.current?.querySelector("em-emoji-picker");
      const input = pickerEl?.shadowRoot?.querySelector<HTMLInputElement>(
        'input[type="search"]',
      );
      if (input) {
        input.focus({ preventScroll: true });
        if (boundInput !== input) {
          if (boundInput) {
            boundInput.removeEventListener("keydown", stopTreeKeydown);
          }
          boundInput = input;
          boundInput.addEventListener("keydown", stopTreeKeydown);
        }
        return;
      }
      if (attempts < 60) {
        rafId = requestAnimationFrame(() => tryFocus(attempts + 1));
      }
    };
    rafId = requestAnimationFrame(() => tryFocus(0));
    return () => {
      cancelled = true;
      if (boundInput) {
        boundInput.removeEventListener("keydown", stopTreeKeydown);
      }
      cancelAnimationFrame(rafId);
    };
  }, [opened]);

  useWindowEvent("keydown", (event) => {
    if (opened && event.key === "Escape") {
      event.stopPropagation();
      event.preventDefault();
      handlers.close();
    }
  });

  // Keep onEmojiSelect current in a ref so the memoized (never-re-rendering)
  // Picker always invokes the latest callback without needing to re-render.
  const onEmojiSelectRef = useRef(onEmojiSelect);
  onEmojiSelectRef.current = onEmojiSelect;

  const handleEmojiSelect = useCallback((emoji: any) => {
    onEmojiSelectRef.current(emoji);
    handlers.close();
  }, [handlers]);

  const handleRemoveEmoji = () => {
    removeEmojiAction();
    handlers.close();
  };

  return (
    <Popover
      opened={opened}
      onClose={handlers.close}
      width={332}
      position="bottom"
      disabled={readOnly}
      closeOnEscape={false}
      closeOnClickOutside={false}
    >
      <Popover.Target ref={targetRef as any}>
        <ActionIcon
          c={actionIconProps?.c || "gray"}
          variant={actionIconProps?.variant || "transparent"}
          size={actionIconProps?.size}
          tabIndex={actionIconProps?.tabIndex}
          onClick={readOnly ? undefined : handlers.toggle}
          aria-label={t("Pick emoji")}
          aria-haspopup="dialog"
          aria-expanded={opened}
        >
          {icon}
        </ActionIcon>
      </Popover.Target>
      <Popover.Dropdown
        ref={dropdownRef as any}
        style={{ border: "none", padding: 0 }}
        // Prevent the sidebar tree row drag handlers from stealing focus.
        onMouseDown={(event) => event.stopPropagation()}
        onPointerDown={(event) => event.stopPropagation()}
      >
        <Suspense fallback={
          <Center w={332} h={435}>
            <Loader size="sm" />
          </Center>
        }>
          <Picker
            onEmojiSelect={handleEmojiSelect}
            perLine={8}
            skinTonePosition="search"
            theme={colorScheme}
          />
          <Button
            variant="default"
            c="gray"
            size="xs"
            style={{
              position: "absolute",
              zIndex: 2,
              bottom: "1rem",
              right: "1rem",
            }}
            onClick={handleRemoveEmoji}
          >
            {t("Remove")}
          </Button>
        </Suspense>
      </Popover.Dropdown>
    </Popover>
  );
}

export default EmojiPicker;
