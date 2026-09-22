import { httpClient } from "./httpClient";
import type {
  GetFleetCapacityResponse,
  GetServerCapacityHistoryResponse,
  GetServerCapacityResponse,
  ServerCapacity,
} from "./types";

/**
 * How full each database server is, for deciding where the next customer goes.
 *
 * Measured live on each call rather than served from a cache. A server's
 * footprint does not move fast enough for one query per look to be worth
 * avoiding, and these numbers are read at the moment somebody is choosing a
 * destination.
 */
export const capacityApi = {
  async fleet(): Promise<ServerCapacity[]> {
    const { data } =
      await httpClient.get<GetFleetCapacityResponse>("/get-fleet-capacity");
    return data.Servers ?? [];
  },

  async server(id: number): Promise<GetServerCapacityResponse> {
    const { data } = await httpClient.get<GetServerCapacityResponse>(
      `/get-server-capacity/${id}`,
    );
    return data;
  },

  /**
   * What the collector recorded for one server over the last `days` days,
   * oldest first. Unlike the calls above this reads stored snapshots rather
   * than measuring, so it is cheap. The service clamps `days` to 1..400.
   */
  async history(id: number, days: number): Promise<GetServerCapacityHistoryResponse> {
    const { data } = await httpClient.get<GetServerCapacityHistoryResponse>(
      `/get-server-capacity-history/${id}`,
      { params: { days } },
    );
    return data;
  },
};
