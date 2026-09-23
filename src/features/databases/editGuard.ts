import type { DatabaseInfoItem } from "@/api/types";

import { isActiveDatabase, whyDatabaseUnavailable } from "./status";

/**
 * The service's refusal when a server or name change is not allowed, word for
 * word (DatabaseInfoController, `RefusedWhileMoving`). Demo mode answers with
 * it too, and the form uses it for the same case before sending anything.
 */
export const RELOCATION_REFUSED_MESSAGE =
  "This database's server or name cannot be changed while it is not active or while a move of it " +
  "can still be rolled back or drop its source. Nothing was saved; reload it and try again.";

/**
 * Why a database's server and name cannot be changed now, or null when they
 * can. The service writes a change of either only while the database is
 * active (and no move of it can still roll back or drop its source, which the
 * service checks). Its description and customer id can be edited in any status.
 */
export const whyDatabaseCannotRelocate = (
  status: string | null | undefined,
): string | null => (isActiveDatabase(status) ? null : whyDatabaseUnavailable(status));

/**
 * Why an edit opened on `opened` must not be saved, given the database as it
 * is now, or null when it can be.
 *
 * The form sends the server and name it was opened with. If either changed
 * since (a move cut over, or another operator edited it), saving would put the
 * old values back over the new ones, so the edit is refused and has to be
 * started again from the current record. A change of server or name that the
 * database's current status rules out is refused with the service's words.
 */
export const whyDatabaseEditIsStale = (
  opened: DatabaseInfoItem,
  current: DatabaseInfoItem | null,
  requested: Pick<DatabaseInfoItem, "DatabaseServerId" | "DatabaseName">,
): string | null => {
  if (!current)
    return `Database ${opened.Id} no longer exists. Close this form and refresh the list.`;
  if (current.DatabaseServerId !== opened.DatabaseServerId)
    return `'${opened.DatabaseName}' has moved to another server since this form was opened. Close it and edit the database again.`;
  if (current.DatabaseName !== opened.DatabaseName)
    return `This database is now named '${current.DatabaseName}', not '${opened.DatabaseName}'. Close this form and edit it again.`;
  const relocating =
    requested.DatabaseServerId !== current.DatabaseServerId ||
    requested.DatabaseName !== current.DatabaseName;
  if (relocating && whyDatabaseCannotRelocate(current.Status))
    return RELOCATION_REFUSED_MESSAGE;
  return null;
};
