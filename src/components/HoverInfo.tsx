import { useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { createPortal } from 'react-dom';

const HOVER_DELAY_MS = 450;

interface HoverInfoProps {
  text: string;
  children: ReactNode;
}

// Wraps a label so hovering (with a short delay, not instant) shows a detail
// tooltip positioned at the mouse — for dense-table headers and abbreviated
// stat labels that aren't self-explanatory.
export function HoverInfo({ text, children }: HoverInfoProps) {
  const [show, setShow] = useState(false);
  const [pos, setPos] = useState({ x: 0, y: 0 });
  const timerRef = useRef<number | undefined>(undefined);

  const handleMouseEnter = (e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY });
    timerRef.current = window.setTimeout(() => setShow(true), HOVER_DELAY_MS);
  };
  const handleMouseMove = (e: React.MouseEvent) => {
    setPos({ x: e.clientX, y: e.clientY });
  };
  const handleMouseLeave = () => {
    window.clearTimeout(timerRef.current);
    setShow(false);
  };

  return (
    <span
      className="hover-info-trigger"
      onMouseEnter={handleMouseEnter}
      onMouseMove={handleMouseMove}
      onMouseLeave={handleMouseLeave}
    >
      {children}
      {show &&
        createPortal(
          <div className="hover-info-tooltip" style={{ left: pos.x + 14, top: pos.y + 14 }}>
            {text}
          </div>,
          document.body
        )}
    </span>
  );
}
