/** A byte stream to the device; packages/serial provides the serialport implementation. */
export interface Transport {
  write(bytes: Uint8Array): Promise<void>;
  onData(cb: (chunk: Uint8Array) => void): () => void;
  close(): Promise<void>;
}
