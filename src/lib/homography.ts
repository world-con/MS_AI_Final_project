type Point = readonly [number, number];

function isFinitePoint(point: Point) {
  return Number.isFinite(point[0]) && Number.isFinite(point[1]);
}

function solveLinearSystem(a: number[][], b: number[]) {
  const n = a.length;
  if (n === 0 || b.length !== n) return null;
  if (a.some((row) => row.length !== n)) return null;

  const augmented = a.map((row, rowIdx) => [...row, b[rowIdx]]);

  for (let col = 0; col < n; col++) {
    let pivotRow = col;
    let pivotValue = Math.abs(augmented[col][col]);
    for (let row = col + 1; row < n; row++) {
      const candidate = Math.abs(augmented[row][col]);
      if (candidate > pivotValue) {
        pivotValue = candidate;
        pivotRow = row;
      }
    }

    if (pivotValue < Number.EPSILON) return null;

    if (pivotRow !== col) {
      const temp = augmented[col];
      augmented[col] = augmented[pivotRow];
      augmented[pivotRow] = temp;
    }

    const pivot = augmented[col][col];
    for (let k = col; k <= n; k++) {
      augmented[col][k] /= pivot;
    }

    for (let row = 0; row < n; row++) {
      if (row === col) continue;
      const factor = augmented[row][col];
      if (Math.abs(factor) < Number.EPSILON) continue;
      for (let k = col; k <= n; k++) {
        augmented[row][k] -= factor * augmented[col][k];
      }
    }
  }

  return augmented.map((row) => row[n]);
}

export function computeHomography(src: Point[], dst: Point[]) {
  if (src.length < 4 || dst.length < 4) return null;

  const src4 = src.slice(0, 4);
  const dst4 = dst.slice(0, 4);
  if (!src4.every(isFinitePoint) || !dst4.every(isFinitePoint)) return null;

  const a: number[][] = [];
  const b: number[] = [];

  for (let i = 0; i < 4; i++) {
    const [x, y] = src4[i];
    const [u, v] = dst4[i];

    a.push([x, y, 1, 0, 0, 0, -u * x, -u * y]);
    b.push(u);

    a.push([0, 0, 0, x, y, 1, -v * x, -v * y]);
    b.push(v);
  }

  const h = solveLinearSystem(a, b);
  if (!h || h.length !== 8) return null;

  return [h[0], h[1], h[2], h[3], h[4], h[5], h[6], h[7], 1] as const;
}

export function applyHomography(
  matrix: readonly number[],
  x: number,
  y: number
) {
  if (matrix.length !== 9) return null;

  const w = matrix[6] * x + matrix[7] * y + matrix[8];
  if (!Number.isFinite(w) || Math.abs(w) < Number.EPSILON) return null;

  const mappedX = (matrix[0] * x + matrix[1] * y + matrix[2]) / w;
  const mappedY = (matrix[3] * x + matrix[4] * y + matrix[5]) / w;

  if (!Number.isFinite(mappedX) || !Number.isFinite(mappedY)) return null;

  return { x: mappedX, y: mappedY };
}

