/*
 * SLIP framing (RFC 1055) as used by Nordic's serial DFU: every message ends with END;
 * END and ESC inside the payload are sent as ESC+ESC_END / ESC+ESC_ESC.
 */
export const SLIP_END = 0xc0;
export const SLIP_ESC = 0xdb;
export const SLIP_ESC_END = 0xdc;
export const SLIP_ESC_ESC = 0xdd;

export function slipEncode(data: Uint8Array): Uint8Array {
  const out: number[] = [];
  for (const b of data) {
    if (b === SLIP_END) out.push(SLIP_ESC, SLIP_ESC_END);
    else if (b === SLIP_ESC) out.push(SLIP_ESC, SLIP_ESC_ESC);
    else out.push(b);
  }
  out.push(SLIP_END);
  return Uint8Array.from(out);
}

/**
 * Stateful decoder: accepts bytes in arbitrary chunks (USB CDC delivers them that way) and
 * calls back once per complete message. An ESC followed by anything else discards the
 * message up to the next END, as the reference implementation does.
 */
export class SlipDecoder {
  private buffer: number[] = [];
  private afterEsc = false;
  private discarding = false;

  constructor(private readonly onMessage: (data: Uint8Array) => void) {}

  feed(chunk: Uint8Array): void {
    for (const b of chunk) {
      if (this.discarding) {
        if (b === SLIP_END) { this.discarding = false; this.buffer = []; }
        continue;
      }
      if (this.afterEsc) {
        this.afterEsc = false;
        if (b === SLIP_ESC_END) this.buffer.push(SLIP_END);
        else if (b === SLIP_ESC_ESC) this.buffer.push(SLIP_ESC);
        else this.discarding = true;
        continue;
      }
      if (b === SLIP_ESC) { this.afterEsc = true; continue; }
      if (b === SLIP_END) {
        if (this.buffer.length > 0) this.onMessage(Uint8Array.from(this.buffer));
        this.buffer = [];
        continue;
      }
      this.buffer.push(b);
    }
  }
}
