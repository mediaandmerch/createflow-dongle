import type { FlasherApi } from "../shared/ipc.js";
declare global { interface Window { flasher: FlasherApi } }
export {};
