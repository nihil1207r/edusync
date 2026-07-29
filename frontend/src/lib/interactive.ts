/**
 * Small, dependency-free cursor-reaction helpers used across ui.tsx and
 * AppShell — no animation library is installed, so these compute plain
 * inline styles (CSS custom properties + transforms) from mouse position.
 */

export function spotlightStyle(e: React.MouseEvent<HTMLElement>) {
  const rect = e.currentTarget.getBoundingClientRect();
  const x = ((e.clientX - rect.left) / rect.width) * 100;
  const y = ((e.clientY - rect.top) / rect.height) * 100;
  return {
    "--spot-x": `${x}%`,
    "--spot-y": `${y}%`,
  } as React.CSSProperties;
}

export function tiltStyle(e: React.MouseEvent<HTMLElement>, max = 8) {
  const rect = e.currentTarget.getBoundingClientRect();
  const px = (e.clientX - rect.left) / rect.width;
  const py = (e.clientY - rect.top) / rect.height;
  const rotateY = (px - 0.5) * max * 2;
  const rotateX = (0.5 - py) * max * 2;
  return {
    "--spot-x": `${px * 100}%`,
    "--spot-y": `${py * 100}%`,
    transform: `perspective(700px) rotateX(${rotateX}deg) rotateY(${rotateY}deg)`,
  } as React.CSSProperties;
}

export function resetTiltStyle() {
  return { transform: "perspective(700px) rotateX(0deg) rotateY(0deg)" } as React.CSSProperties;
}

export function magnetStyle(e: React.MouseEvent<HTMLElement>, strength = 0.2) {
  const rect = e.currentTarget.getBoundingClientRect();
  const mx = (e.clientX - rect.left - rect.width / 2) * strength;
  const my = (e.clientY - rect.top - rect.height / 2) * strength;
  return { transform: `translate(${mx}px, ${my}px)` } as React.CSSProperties;
}

export const resetMagnetStyle = { transform: "translate(0, 0)" } as React.CSSProperties;
