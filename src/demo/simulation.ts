/**
 * Demo mode's stand-in for the service's background work.
 *
 * The real service advances customer moves in an executor, closes silent
 * migration sessions in a sweeper, and expires unredeemed keys when the list
 * is read. None of that runs in the browser, so without this every demo move
 * would sit at `planned` and every live session would poll forever. These run
 * whenever the demo adapter serves the records they change, so state moves on
 * as the page polls, the way it does against the real service.
 */
import type {
  CustomerMove,
  CustomerMoveVerification,
  DatabaseInfoItem,
  MigrationSessionItem,
  MigrationSessionProgressItem,
} from "@/api/types";

/** Seconds after planning at which a demo move enters each phase. */
const MOVE_PHASES: ReadonlyArray<{
  status: string;
  atSeconds: number;
  detail: string;
}> = [
  {
    status: "draining",
    atSeconds: 3,
    detail: "Waiting for the customer's open sessions to end.",
  },
  { status: "copying", atSeconds: 8, detail: "Copying tables to the target." },
  {
    status: "verifying",
    atSeconds: 15,
    detail: "Comparing every table between source and target.",
  },
  {
    status: "flipped",
    atSeconds: 20,
    detail: "Cut over. The source is retained, so this can still be rolled back.",
  },
];

const ACTIVE_MOVES = new Set(["planned", "draining", "copying", "verifying"]);

/** The service's sweeper: a session silent this long is closed as failed. */
const STALE_SESSION_MS = 15 * 60_000;

/** How long a demo stream runs, from when demo mode first sees it, before it completes. */
const DEMO_STREAM_MS = 2 * 60_000;

export interface SimulationState {
  databases: DatabaseInfoItem[];
  customerMoves: CustomerMove[];
  customerMoveVerification: Record<number, CustomerMoveVerification[]>;
  migrationSessions: MigrationSessionItem[];
  migrationProgress: Record<number, MigrationSessionProgressItem[]>;
  /** When each live demo stream will finish, set the first time it is seen. */
  demoStreamsEndAt: Record<number, number>;
  progressIds: { next: () => number };
}

/** Advances every active move to the phase its age calls for. */
export function advanceMoves(state: SimulationState, now: number): void {
  for (const move of state.customerMoves) {
    if (!ACTIVE_MOVES.has(move.Status ?? "")) continue;
    const ageSeconds = (now - Date.parse(move.CreatedDateTimeUtc)) / 1000;
    // `planned` is before the first phase, so it reads as -1.
    const current = MOVE_PHASES.findIndex((p) => p.status === move.Status);
    const due = MOVE_PHASES.filter((p) => ageSeconds >= p.atSeconds).length - 1;

    // Every phase in between is entered in order, so a page polled rarely still
    // gets each timestamp stamped.
    for (let i = current + 1; i <= due; i++) {
      enterPhase(state, move, MOVE_PHASES[i].status, MOVE_PHASES[i].detail, now);
    }
  }
}

function enterPhase(
  state: SimulationState,
  move: CustomerMove,
  status: string,
  detail: string,
  now: number,
): void {
  const at = new Date(now).toISOString();
  move.Status = status;
  move.PhaseDetail = detail;

  if (status === "draining") move.QuiescedDateTimeUtc = at;
  if (status === "copying") move.CopyStartedDateTimeUtc = at;
  if (status === "verifying") move.CopyCompletedDateTimeUtc = at;
  if (status !== "flipped") return;

  move.VerifiedDateTimeUtc = at;
  move.FlippedDateTimeUtc = at;
  move.SourceRetiredDateTimeUtc = at;
  state.customerMoveVerification[move.Id] = ["patient", "appointment", "audit_log"].map(
    (table, i) => ({
      Id: move.Id * 10 + i,
      CustomerMoveId: move.Id,
      TableName: table,
      SourceRowCount: 12_000 * (i + 1),
      TargetRowCount: 12_000 * (i + 1),
      SourceChecksum: 4_000_000_000 + i,
      TargetChecksum: 4_000_000_000 + i,
      VerificationMethod: "checksum",
      Matched: true,
      CheckedDateTimeUtc: at,
    }),
  );

  // The flip: the one registration now points at the target, and the customer
  // is back online there.
  const database = state.databases.find((d) => d.Id === move.DatabaseId);
  if (database) {
    database.DatabaseServerId = move.TargetDatabaseServerId;
    database.DatabaseName = move.TargetDatabaseName ?? database.DatabaseName;
    database.Status = "active";
  }
}

/** Points a rolled-back move's database at its source again, as the service does. */
export function restoreSource(state: SimulationState, move: CustomerMove): void {
  const database = state.databases.find((d) => d.Id === move.DatabaseId);
  if (!database) return;
  database.DatabaseServerId = move.SourceDatabaseServerId;
  database.DatabaseName = move.SourceDatabaseName ?? database.DatabaseName;
  database.Status = "active";
}

/**
 * What the service does to sessions without anyone asking: expires unredeemed
 * keys past their time, closes live sessions that have gone silent, and here
 * also lets a live demo stream finish, so the list stops polling.
 */
export function advanceSessions(state: SimulationState, now: number): void {
  const at = new Date(now).toISOString();

  for (const session of state.migrationSessions) {
    if (session.Status === "pending" && Date.parse(session.ExpiresDateTimeUtc) < now) {
      session.Status = "expired";
      continue;
    }

    if (session.Status !== "redeemed" && session.Status !== "streaming") continue;

    const lastHeard = Date.parse(
      session.LastHeartbeatUtc ?? session.RedeemedDateTimeUtc ?? at,
    );
    if (now - lastHeard > STALE_SESSION_MS) {
      close(
        state,
        session,
        "failed",
        at,
        "No progress reported for over 15 minutes. The migration was closed automatically; the destination is left as it was for inspection.",
      );
      continue;
    }

    const endsAt = (state.demoStreamsEndAt[session.Id] ??= now + DEMO_STREAM_MS);
    if (now >= endsAt) {
      close(state, session, "completed", at, "Migration completed.");
    } else {
      session.LastHeartbeatUtc = at;
    }
  }
}

function close(
  state: SimulationState,
  session: MigrationSessionItem,
  status: "completed" | "failed",
  at: string,
  message: string,
): void {
  session.Status = status;
  session.CompletedDateTimeUtc = at;
  if (status === "failed") session.ErrorMessage = message;
  else session.Phase = "Finalize";
  (state.migrationProgress[session.Id] ??= []).push({
    Id: state.progressIds.next(),
    UtcTimestamp: at,
    Phase: session.Phase,
    TableName: null,
    RowsDone: null,
    RowsTotal: null,
    BytesDone: null,
    Message: message,
    IsError: status === "failed",
  });
}
