/**
 * Demo-mode in-memory store.
 *
 * Holds mutable copies of the demo fixtures so that creates / updates /
 * deletes performed during the demo persist for the lifetime of the
 * tab. A page reload re-imports this module and snaps everything back
 * to the seed — exactly the behavior we want for demos:
 *
 *   - Show up, log in, the seed dataset is there.
 *   - Add a server, edit a user, delete a dump → state reflects it
 *     immediately and survives navigation.
 *   - Reload the tab → fresh seed, ready for another walkthrough.
 *
 * This module is *only* loaded when demo mode is active (gated by
 * env.demoMode in installDemo.ts), so the production bundle does not
 * pay any cost for it (Vite tree-shakes the unreachable import).
 */
import type {
  AuthorizedUserInfoItem,
  DatabaseInfoItem,
  DatabasePrivilegeInfo,
  DatabaseServerInfoItem,
  DumpInfoItem,
  EventLogEntry,
  GetStaticDatabaseUserResponse,
} from "@/api/types";

import {
  seedAuthorizedUsers,
  seedDatabases,
  seedDumps,
  seedEventLog,
  seedServers,
  seedStaticUserPrivileges,
  seedStaticUsers,
} from "./fixtures";

/**
 * Deep-clone helper. structuredClone is available in every browser the
 * portal targets (Chromium 98+, Firefox 94+, Safari 15.4+) and avoids
 * the JSON-roundtrip pitfalls (Date, undefined, etc.).
 */
function clone<T>(value: T): T {
  return structuredClone(value);
}

interface IdSequence {
  next(): number;
}

function makeIdSequence(start: number): IdSequence {
  let current = start;
  return {
    next: () => ++current,
  };
}

class DemoStore {
  servers: DatabaseServerInfoItem[] = clone(seedServers);
  databases: DatabaseInfoItem[] = clone(seedDatabases);
  authorizedUsers: AuthorizedUserInfoItem[] = clone(seedAuthorizedUsers);
  staticUsers: GetStaticDatabaseUserResponse[] = clone(seedStaticUsers);
  staticUserPrivileges: Record<number, DatabasePrivilegeInfo[]> = clone(
    seedStaticUserPrivileges,
  );
  dumps: DumpInfoItem[] = clone(seedDumps);
  eventLog: EventLogEntry[] = clone(seedEventLog);

  // ID sequences seeded above the highest fixture id so freshly-created
  // records never collide with the seed.
  serverIds: IdSequence = makeIdSequence(100);
  databaseIds: IdSequence = makeIdSequence(200);
  authorizedUserIds: IdSequence = makeIdSequence(2000);
  staticUserIds: IdSequence = makeIdSequence(100);
  dumpIds: IdSequence = makeIdSequence(6000);
  eventLogIds: IdSequence = makeIdSequence(10_000);

  /** Add a synthetic event-log entry whenever the demo performs a write. */
  recordAdminEvent(message: string, details: string | null = null): void {
    this.eventLog.unshift({
      Id: this.eventLogIds.next(),
      TimestampUtc: new Date().toISOString(),
      UserEmail: null,
      IpAddress: null,
      DatabaseServerId: null,
      DatabaseId: null,
      EventType: "AdminAction",
      Message: message,
      Details: details,
    });
  }
}

/**
 * Singleton — the adapter imports this and holds it for the tab's
 * lifetime. We intentionally export the instance (not a factory) so
 * every adapter handler reads/writes the same state.
 */
export const demoStore = new DemoStore();
