import { useEffect, useRef, useState } from "react";

export function FlashValue({
  value,
  className,
  title,
}: {
  value: string;
  className: string;
  title?: string;
}) {
  const [flash, setFlash] = useState(false);
  const prev = useRef(value);

  useEffect(() => {
    if (prev.current !== value) {
      setFlash(true);
      prev.current = value;
      const timer = window.setTimeout(() => setFlash(false), 600);
      return () => window.clearTimeout(timer);
    }
  }, [value]);

  return (
    <div className={`${className} transition-colors duration-300 ${flash ? "text-amber-300" : ""}`} title={title}>
      {value}
    </div>
  );
}
