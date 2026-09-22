import { httpClient } from "./httpClient";
import type {
  CreateCustomerMoveRequest,
  CustomerMove,
  CustomerMoveResult,
  GetCustomerMoveResponse,
  GetCustomerMovesResponse,
} from "./types";

/**
 * Moving a customer's database from one server to another.
 *
 * These record intent. The work runs in a background executor on the service,
 * because copying a whole customer database takes as long as it takes, so the
 * portal plans a move and then watches it happen.
 */
export const movesApi = {
  async list(): Promise<CustomerMove[]> {
    const { data } =
      await httpClient.get<GetCustomerMovesResponse>("/get-customer-moves");
    return data.Moves ?? [];
  },

  async get(id: number): Promise<GetCustomerMoveResponse> {
    const { data } = await httpClient.get<GetCustomerMoveResponse>(
      `/get-customer-move/${id}`,
    );
    return data;
  },

  async create(request: CreateCustomerMoveRequest): Promise<CustomerMoveResult> {
    const { data } = await httpClient.post<CustomerMoveResult>(
      "/create-customer-move",
      request,
    );
    return data;
  },

  /** Points a cut-over customer back at the source. Only while the source still exists. */
  async rollBack(id: number): Promise<CustomerMoveResult> {
    const { data } = await httpClient.post<CustomerMoveResult>(
      `/roll-back-customer-move/${id}`,
    );
    return data;
  },

  /**
   * Drops the source a completed move left behind.
   *
   * The point of no return: until this runs, rolling back is a pointer update.
   */
  async dropSource(id: number): Promise<CustomerMoveResult> {
    const { data } = await httpClient.post<CustomerMoveResult>(
      `/drop-customer-move-source/${id}`,
    );
    return data;
  },
};
