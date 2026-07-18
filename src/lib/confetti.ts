import confetti from "canvas-confetti";

export function celebrate() {
  if (typeof window === "undefined") return;
  const end = Date.now() + 600;
  const colors = ["#2dd4bf", "#fbbf24", "#f8f9fa"];
  (function frame() {
    confetti({
      particleCount: 4,
      angle: 60,
      spread: 60,
      origin: { x: 0, y: 0.7 },
      colors,
    });
    confetti({
      particleCount: 4,
      angle: 120,
      spread: 60,
      origin: { x: 1, y: 0.7 },
      colors,
    });
    if (Date.now() < end) requestAnimationFrame(frame);
  })();
}

const KEY = "careerlift.milestones";

export function celebrateOnce(id: string) {
  if (typeof window === "undefined") return;
  try {
    const raw = localStorage.getItem(KEY);
    const seen: string[] = raw ? JSON.parse(raw) : [];
    if (seen.includes(id)) return;
    seen.push(id);
    localStorage.setItem(KEY, JSON.stringify(seen));
    celebrate();
  } catch {
    celebrate();
  }
}
