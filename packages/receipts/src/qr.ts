/** Local QR Model 2, fixed version 6-L, byte mode, mask 0.
 * Intentionally bounded to 134 ASCII URL bytes. No network or embedded secrets.
 * Two 68-byte data blocks, 18 Reed-Solomon bytes per block, GF(256)/0x11D.
 */
export function receiptQrMatrix(value: string): readonly (readonly boolean[])[] {
  if (!/^[\x21-\x7e]{1,134}$/u.test(value)) throw new Error("Verification URL exceeds QR limits.");
  const bits: number[] = [];
  const append = (n: number, width: number) => { for (let i = width - 1; i >= 0; i--) bits.push((n >>> i) & 1); };
  append(4, 4); append(value.length, 8);
  for (const c of value) append(c.charCodeAt(0), 8);
  append(0, Math.min(4, 1088 - bits.length));
  while (bits.length % 8) bits.push(0);
  const data: number[] = [];
  for (let i = 0; i < bits.length; i += 8) data.push(bits.slice(i, i + 8).reduce((a, b) => a * 2 + b, 0));
  for (let pad = 0; data.length < 136; pad++) data.push(pad % 2 === 0 ? 0xec : 0x11);
  const multiply = (a: number, b: number): number => {
    let r = 0;
    for (let i = 7; i >= 0; i--) { r = (r << 1) ^ ((r >>> 7) * 0x11d); r ^= ((b >>> i) & 1) * a; }
    return r;
  };
  let generator = [1], root = 1;
  for (let i = 0; i < 18; i++) {
    const next = Array<number>(generator.length + 1).fill(0);
    for (let j = 0; j < generator.length; j++) {
      next[j] = next[j]! ^ generator[j]!;
      next[j + 1] = next[j + 1]! ^ multiply(generator[j]!, root);
    }
    generator = next; root = multiply(root, 2);
  }
  const blocks = [data.slice(0, 68), data.slice(68)];
  const parity = blocks.map(block => {
    const message = [...block, ...Array<number>(18).fill(0)];
    for (let i = 0; i < block.length; i++) {
      const factor = message[i]!;
      for (let j = 0; j < generator.length; j++) message[i + j] = message[i + j]! ^ multiply(factor, generator[j]!);
    }
    return message.slice(-18);
  });
  const codewords: number[] = [];
  for (let i = 0; i < 68; i++) for (const b of blocks) codewords.push(b[i]!);
  for (let i = 0; i < 18; i++) for (const b of parity) codewords.push(b[i]!);
  const size = 41, matrix = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const fixed = Array.from({ length: size }, () => Array<boolean>(size).fill(false));
  const set = (x: number, y: number, dark: boolean) => {
    if (x >= 0 && y >= 0 && x < size && y < size) { matrix[y]![x] = dark; fixed[y]![x] = true; }
  };
  for (let i = 0; i < size; i++) { set(6, i, i % 2 === 0); set(i, 6, i % 2 === 0); }
  for (const [cx, cy] of [[3, 3], [37, 3], [3, 37]]) {
    for (let dy = -4; dy <= 4; dy++) for (let dx = -4; dx <= 4; dx++) {
      const d = Math.max(Math.abs(dx), Math.abs(dy)); set(cx! + dx, cy! + dy, d !== 2 && d !== 4);
    }
  }
  for (let dy = -2; dy <= 2; dy++) for (let dx = -2; dx <= 2; dx++) set(34 + dx, 34 + dy, Math.max(Math.abs(dx), Math.abs(dy)) !== 1);
  const formatData = 8; let remainder = formatData;
  for (let i = 0; i < 10; i++) remainder = (remainder << 1) ^ ((remainder >>> 9) * 0x537);
  const format = ((formatData << 10) | remainder) ^ 0x5412;
  const bit = (i: number) => ((format >>> i) & 1) !== 0;
  for (let i = 0; i <= 5; i++) set(8, i, bit(i));
  set(8, 7, bit(6)); set(8, 8, bit(7)); set(7, 8, bit(8));
  for (let i = 9; i < 15; i++) set(14 - i, 8, bit(i));
  for (let i = 0; i < 8; i++) set(size - 1 - i, 8, bit(i));
  for (let i = 8; i < 15; i++) set(8, size - 15 + i, bit(i));
  set(8, size - 8, true);
  let at = 0;
  for (let right = size - 1; right >= 1; right -= 2) {
    if (right === 6) right = 5;
    for (let vertical = 0; vertical < size; vertical++) for (let j = 0; j < 2; j++) {
      const x = right - j, y = ((right + 1) & 2) === 0 ? size - 1 - vertical : vertical;
      if (fixed[y]![x]) continue;
      const valueBit = at < codewords.length * 8 ? (codewords[at >>> 3]! >>> (7 - (at % 8))) & 1 : 0;
      matrix[y]![x] = Boolean(valueBit ^ ((x + y) % 2 === 0 ? 1 : 0)); at++;
    }
  }
  if (at !== 1383) throw new Error("QR layout invariant failed.");
  return Object.freeze(matrix.map(row => Object.freeze(row)));
}
export function receiptQrSvg(url: string): string {
  const matrix = receiptQrMatrix(url), path: string[] = [];
  matrix.forEach((line, y) => line.forEach((dark, x) => { if (dark) path.push(`M${x + 4},${y + 4}h1v1h-1z`); }));
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 49 49" width="196" height="196" role="img" aria-label="QR code for public receipt verification" shape-rendering="crispEdges"><rect width="49" height="49" fill="white"/><path d="${path.join("")}" fill="black"/></svg>`;
}
