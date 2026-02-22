import { useEffect, useMemo, useRef, useState } from "react";
import type { CSSProperties } from "react";
import { createPortal } from "react-dom";

export type RoundedSelectOption = {
  value: string;
  label: string;
  disabled?: boolean;
};

type Props = {
  value: string;
  onChange: (value: string) => void;
  options: RoundedSelectOption[];
  placeholder?: string;
  disabled?: boolean;
  style?: CSSProperties;
  menuMaxHeight?: number;
};

export default function RoundedSelect({
  value,
  onChange,
  options,
  placeholder = "Select",
  disabled = false,
  style,
  menuMaxHeight = 280,
}: Props) {
  const [open, setOpen] = useState(false);
  const [menuRect, setMenuRect] = useState<{ left: number; top: number; width: number } | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);

  const selected = useMemo(() => options.find((o) => o.value === value), [options, value]);

  useEffect(() => {
    function updateMenuRect() {
      const trigger = triggerRef.current;
      if (!trigger) return;
      const rect = trigger.getBoundingClientRect();
      setMenuRect({
        left: rect.left,
        top: rect.bottom + 6,
        width: rect.width,
      });
    }

    function onPointerDown(e: MouseEvent) {
      const target = e.target as Node;
      if (rootRef.current?.contains(target)) return;
      if (menuRef.current?.contains(target)) return;
      setOpen(false);
    }

    function onEsc(e: KeyboardEvent) {
      if (e.key === "Escape") setOpen(false);
    }

    function onWindowChange() {
      if (open) updateMenuRect();
    }

    if (open) updateMenuRect();
    window.addEventListener("mousedown", onPointerDown);
    window.addEventListener("keydown", onEsc);
    window.addEventListener("resize", onWindowChange);
    window.addEventListener("scroll", onWindowChange, true);
    return () => {
      window.removeEventListener("mousedown", onPointerDown);
      window.removeEventListener("keydown", onEsc);
      window.removeEventListener("resize", onWindowChange);
      window.removeEventListener("scroll", onWindowChange, true);
    };
  }, [open]);

  return (
    <div ref={rootRef} style={{ position: "relative", width: "100%" }}>
      <button
        ref={triggerRef}
        type="button"
        onClick={() => !disabled && setOpen((v) => !v)}
        disabled={disabled}
        style={{
          width: "100%",
          padding: "10px 12px",
          borderRadius: 14,
          border: "1px solid var(--line)",
          background: "linear-gradient(180deg, rgba(21, 34, 62, 0.94), rgba(13, 22, 42, 0.98))",
          color: "var(--text-0)",
          fontSize: 16,
          textAlign: "left",
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          gap: 10,
          boxShadow: "none",
          ...style,
        }}
      >
        <span
          style={{
            color: selected ? "var(--text-0)" : "var(--text-2)",
            whiteSpace: "nowrap",
            overflow: "hidden",
            textOverflow: "ellipsis",
          }}
          title={selected?.label ?? placeholder}
        >
          {selected?.label ?? placeholder}
        </span>
        <span
          style={{
            color: "#c6d3e7",
            fontSize: 12,
            transform: open ? "rotate(180deg)" : "none",
            transition: "transform 0.16s ease",
          }}
        >
          ▼
        </span>
      </button>

      {open &&
        menuRect &&
        typeof document !== "undefined" &&
        createPortal(
          <div
            ref={menuRef}
            style={{
              position: "fixed",
              left: menuRect.left,
              top: menuRect.top,
              width: menuRect.width,
              borderRadius: 14,
              border: "1px solid var(--line-strong)",
              background: "linear-gradient(180deg, rgba(15, 23, 42, 0.98), rgba(12, 19, 37, 0.98))",
              boxShadow: "0 18px 42px rgba(2, 8, 23, 0.56)",
              padding: 6,
              maxHeight: menuMaxHeight,
              overflowY: "auto",
              zIndex: 5000,
            }}
          >
            {options.map((opt) => {
              const isSelected = opt.value === value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  disabled={opt.disabled}
                  onMouseDown={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                  }}
                  onClick={(e) => {
                    e.preventDefault();
                    e.stopPropagation();
                    if (opt.disabled) return;
                    onChange(opt.value);
                    window.setTimeout(() => setOpen(false), 0);
                  }}
                  style={{
                    width: "100%",
                    borderRadius: 10,
                    border: isSelected ? "1px solid var(--line-strong)" : "1px solid transparent",
                    background: isSelected ? "rgba(14, 165, 233, 0.2)" : "transparent",
                    color: opt.disabled ? "#64748b" : "var(--text-0)",
                    textAlign: "left",
                    padding: "10px 11px",
                    fontSize: 15,
                    fontWeight: isSelected ? 700 : 600,
                    boxShadow: "none",
                    cursor: opt.disabled ? "not-allowed" : "pointer",
                    marginBottom: 3,
                  }}
                  title={opt.label}
                >
                  <span style={{ display: "block", whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>
                    {opt.label}
                  </span>
                </button>
              );
            })}
            {options.length === 0 && (
              <div style={{ padding: "10px 11px", color: "#94a3b8", fontSize: 14 }}>No options</div>
            )}
          </div>,
          document.body
        )}
    </div>
  );
}

