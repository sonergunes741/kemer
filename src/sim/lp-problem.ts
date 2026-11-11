/** The data of a small LP: maximise c.x subject to sparse rows a_i.x <= b_i, x free (see lp.ts). */

/** Rows in compressed sparse form. Build with add()/end(); reuse with reset(). */
export class LpProblem {
  n = 0;
  m = 0;
  rowStart: Int32Array;
  cols: Int32Array;
  vals: Float64Array;
  rhs: Float64Array;
  /** Rows that were violated in earlier solves: priced first (pure speed-up, see LpSolver). */
  hot: Int32Array;
  hotCount = 0;
  inHot: Uint8Array;
  private nz = 0;

  constructor(rowCapacity = 256, nzCapacity = 1024) {
    this.rowStart = new Int32Array(rowCapacity + 1);
    this.rhs = new Float64Array(rowCapacity);
    this.inHot = new Uint8Array(rowCapacity);
    this.hot = new Int32Array(rowCapacity);
    this.cols = new Int32Array(nzCapacity);
    this.vals = new Float64Array(nzCapacity);
  }

  /** Start over with `n` variables. `keepHot` keeps the hot list (same row layout, new numbers). */
  reset(n: number, keepHot = false): void {
    this.n = n;
    this.m = 0;
    this.nz = 0;
    if (!keepHot) this.clearHot();
  }

  clearHot(): void {
    for (let i = 0; i < this.hotCount; i++) this.inHot[this.hot[i] as number] = 0;
    this.hotCount = 0;
  }

  /** Add one coefficient to the row being built. */
  add(col: number, val: number): void {
    if (this.nz === this.cols.length) this.growNz();
    this.cols[this.nz] = col;
    this.vals[this.nz] = val;
    this.nz++;
  }

  /** Close the row being built with its right-hand side; returns the row index. */
  end(rhs: number): number {
    if (this.m === this.rhs.length) this.growRows();
    const i = this.m;
    this.rhs[i] = rhs;
    this.m = i + 1;
    this.rowStart[this.m] = this.nz;
    return i;
  }

  /** a_i·x - b_i (positive when the row is violated). */
  slack(i: number, x: ArrayLike<number>): number {
    let s = -(this.rhs[i] as number);
    const end = this.rowStart[i + 1] as number;
    for (let k = this.rowStart[i] as number; k < end; k++) s += (this.vals[k] as number) * (x[this.cols[k] as number] as number);
    return s;
  }

  markHot(i: number): void {
    if (this.inHot[i] === 0) {
      this.inHot[i] = 1;
      this.hot[this.hotCount++] = i;
    }
  }

  private growNz(): void {
    const size = this.cols.length * 2;
    const cols = new Int32Array(size);
    const vals = new Float64Array(size);
    cols.set(this.cols);
    vals.set(this.vals);
    this.cols = cols;
    this.vals = vals;
  }

  private growRows(): void {
    const size = this.rhs.length * 2;
    const rowStart = new Int32Array(size + 1);
    const rhs = new Float64Array(size);
    const inHot = new Uint8Array(size);
    const hot = new Int32Array(size);
    rowStart.set(this.rowStart);
    rhs.set(this.rhs);
    inHot.set(this.inHot);
    hot.set(this.hot);
    this.rowStart = rowStart;
    this.rhs = rhs;
    this.inHot = inHot;
    this.hot = hot;
  }
}
