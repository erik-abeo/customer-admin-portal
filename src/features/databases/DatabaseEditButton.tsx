import { ActionIcon, Tooltip } from "@mantine/core";
import { IconEdit } from "@tabler/icons-react";

import type { DatabaseInfoItem } from "@/api/types";
import { RequireRole } from "@/auth/RequireRole";

import { whyDatabaseCannotRelocate } from "./editGuard";

interface DatabaseEditButtonProps {
  database: DatabaseInfoItem;
  onEdit: () => void;
}

/**
 * The per-row edit action for a database, for admins only. Shared so every
 * list that offers it applies the same rules. It stays available in any
 * status, because the description can be edited while a database is moving;
 * the form locks the server and name instead, and the tooltip says so.
 */
export function DatabaseEditButton({ database, onEdit }: DatabaseEditButtonProps) {
  const locked = whyDatabaseCannotRelocate(database.Status);
  const label = locked
    ? `Edit database (server and name locked: ${locked})`
    : "Edit database";
  return (
    <RequireRole role="admin" fallback="disable">
      <Tooltip label={label}>
        <ActionIcon
          variant="subtle"
          onClick={onEdit}
          aria-label={`Edit ${database.DatabaseName}`}
        >
          <IconEdit size={16} />
        </ActionIcon>
      </Tooltip>
    </RequireRole>
  );
}
