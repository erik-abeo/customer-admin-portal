import { LIVE_API_PORT } from "./ports";
import { startStack } from "./stack";

/** Brings up the real API for the live suite and returns its teardown. */
export default async function globalSetup(): Promise<() => Promise<void>> {
  return startStack(LIVE_API_PORT);
}
