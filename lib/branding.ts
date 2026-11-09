const KENKYO_DEFAULT = "#1b9aaa";

function hexToRgb(hex: string): [number, number, number] | null {
  const match = /^#([0-9a-f]{6})$/i.exec(hex.trim());
  if (!match) return null;
  const n = parseInt(match[1], 16);
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255];
}

function mix([r, g, b]: [number, number, number], target: [number, number, number], amount: number) {
  return [
    Math.round(r + (target[0] - r) * amount),
    Math.round(g + (target[1] - g) * amount),
    Math.round(b + (target[2] - b) * amount),
  ] as [number, number, number];
}

function toHex([r, g, b]: [number, number, number]) {
  return `#${[r, g, b].map((c) => c.toString(16).padStart(2, "0")).join("")}`;
}

/** Deriva as variações de cor (mais escura, mais clara, tints) que o
 * app usa a partir de uma única cor primária por empresa. Cai pro
 * teal padrão do DiaCheck se a empresa não tiver cor configurada ou
 * o valor salvo não for um hex válido. */
export function resolveBrandColors(primaryColor: string | null | undefined) {
  const rgb = hexToRgb(primaryColor ?? "") ?? hexToRgb(KENKYO_DEFAULT)!;
  const hex = toHex(rgb);
  const deep = toHex(mix(rgb, [0, 0, 0], 0.18));
  const light = toHex(mix(rgb, [255, 255, 255], 0.35));

  return {
    red: hex,
    redDeep: deep,
    redLight: light,
    gradient: `linear-gradient(135deg, ${hex} 0%, ${deep} 100%)`,
    glow: `0 4px 14px rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.22)`,
    tint: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.1)`,
    tintSoft: `rgba(${rgb[0]}, ${rgb[1]}, ${rgb[2]}, 0.05)`,
    onTint: toHex(mix(rgb, [0, 0, 0], 0.3)),
  };
}
