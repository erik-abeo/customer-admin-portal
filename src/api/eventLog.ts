import { httpClient } from "./httpClient";
import type { EventLogQueryParams, EventLogQueryResponse } from "./types";

/**
 * Event log query API. PENDING BACKEND — see BACKEND-CONTRACT.md →
 * "Event Log". UI surface gated behind `features.eventLog`.
 */
export const eventLogApi = {
  async query(params: EventLogQueryParams = {}): Promise<EventLogQueryResponse> {
    const { data } = await httpClient.get<EventLogQueryResponse>("/event-log", {
      params,
    });
    return data;
  },

  /**
   * Returns the raw CSV blob for the current filters. Useful for export
   * buttons that hand-off to a download.
   */
  async exportCsv(params: EventLogQueryParams = {}): Promise<Blob> {
    const { data } = await httpClient.get<Blob>("/event-log/export.csv", {
      params,
      responseType: "blob",
    });
    return data;
  },
};
