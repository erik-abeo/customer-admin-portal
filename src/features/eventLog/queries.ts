import { keepPreviousData, useQuery } from "@tanstack/react-query";

import { eventLogApi } from "@/api/eventLog";
import type { EventLogQueryParams } from "@/api/types";

const KEYS = {
  query: (params: EventLogQueryParams) => ["event-log", params] as const,
};

/**
 * Paginated event-log query. Uses `keepPreviousData` so the table stays
 * visible while the next page loads (no flicker between page changes).
 */
export function useEventLog(params: EventLogQueryParams) {
  return useQuery({
    queryKey: KEYS.query(params),
    queryFn: () => eventLogApi.query(params),
    placeholderData: keepPreviousData,
  });
}

export const eventLogKeys = KEYS;
