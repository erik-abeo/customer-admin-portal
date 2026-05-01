/**
 * useUploadDump tests.
 *
 * The hook wraps `dumpsApi.upload` and surfaces a `progress: number | null`
 * fraction so the upload modal can render a real progress bar. We mock
 * the API module so we don't need a network adapter, and drive the
 * progress callback by hand to simulate axios's `onUploadProgress` event
 * stream.
 */
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { act, renderHook, waitFor } from "@testing-library/react";
import type { ReactNode } from "react";
import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";

import { dumpsApi } from "@/api/dumps";
import type { CreateDumpResponse } from "@/api/types";
import { useUploadDump } from "./queries";

vi.mock("@/api/dumps", () => ({
  dumpsApi: { upload: vi.fn() },
}));

function makeWrapper() {
  const queryClient = new QueryClient({
    defaultOptions: { queries: { retry: false }, mutations: { retry: false } },
  });
  return function Wrapper({ children }: { children: ReactNode }) {
    return <QueryClientProvider client={queryClient}>{children}</QueryClientProvider>;
  };
}

const sampleFile = new File(["abc"], "dump.sql", { type: "application/sql" });
const successResponse = { Success: true as const, Message: null, Id: 9999 };

describe("useUploadDump", () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  afterEach(() => {
    vi.clearAllMocks();
  });

  it("starts with progress=null and isPending=false", () => {
    const { result } = renderHook(() => useUploadDump(), { wrapper: makeWrapper() });
    expect(result.current.progress).toBeNull();
    expect(result.current.isPending).toBe(false);
  });

  it("publishes the loaded/total ratio as a 0..1 fraction", async () => {
    let resolveUpload: ((value: CreateDumpResponse) => void) | null = null;
    let capturedOnProgress: ((loaded: number, total: number) => void) | null = null;

    vi.mocked(dumpsApi.upload).mockImplementation(async (_file, _meta, onProgress) => {
      capturedOnProgress = onProgress ?? null;
      return new Promise((resolve) => {
        resolveUpload = resolve;
      });
    });

    const { result } = renderHook(() => useUploadDump(), { wrapper: makeWrapper() });

    act(() => {
      void result.current.mutateAsync({
        file: sampleFile,
        databaseServerId: 1,
        databaseId: 2,
        description: "test",
      });
    });

    await waitFor(() => {
      expect(capturedOnProgress).not.toBeNull();
    });

    act(() => {
      capturedOnProgress!(25, 100);
    });
    expect(result.current.progress).toBeCloseTo(0.25);

    act(() => {
      capturedOnProgress!(75, 100);
    });
    expect(result.current.progress).toBeCloseTo(0.75);

    // Saturate at 1.0 even if the server reports more than total (rare but
    // observed in some proxies that double-count).
    act(() => {
      capturedOnProgress!(150, 100);
    });
    expect(result.current.progress).toBe(1);

    act(() => {
      resolveUpload!(successResponse);
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
  });

  it("ignores progress events with total <= 0", async () => {
    let capturedOnProgress: ((loaded: number, total: number) => void) | null = null;

    vi.mocked(dumpsApi.upload).mockImplementation(async (_f, _m, onProgress) => {
      capturedOnProgress = onProgress ?? null;
      return successResponse;
    });

    const { result } = renderHook(() => useUploadDump(), { wrapper: makeWrapper() });

    act(() => {
      void result.current.mutateAsync({
        file: sampleFile,
        databaseServerId: 1,
        databaseId: 2,
      });
    });

    await waitFor(() => {
      expect(capturedOnProgress).not.toBeNull();
    });

    act(() => {
      capturedOnProgress!(10, 0);
    });
    // Progress remains null because total wasn't a usable denominator.
    expect(result.current.progress).toBeNull();
  });

  it("clears progress to null after the mutation settles (success)", async () => {
    vi.mocked(dumpsApi.upload).mockImplementation(async (_f, _m, onProgress) => {
      onProgress?.(50, 100);
      return successResponse;
    });

    const { result } = renderHook(() => useUploadDump(), { wrapper: makeWrapper() });

    await act(async () => {
      await result.current.mutateAsync({
        file: sampleFile,
        databaseServerId: 1,
        databaseId: 2,
      });
    });

    await waitFor(() => {
      expect(result.current.isSuccess).toBe(true);
    });
    expect(result.current.progress).toBeNull();
  });

  it("clears progress to null after the mutation settles (error)", async () => {
    vi.mocked(dumpsApi.upload).mockImplementation(async (_f, _m, onProgress) => {
      onProgress?.(20, 100);
      throw new Error("boom");
    });

    const { result } = renderHook(() => useUploadDump(), { wrapper: makeWrapper() });

    await act(async () => {
      try {
        await result.current.mutateAsync({
          file: sampleFile,
          databaseServerId: 1,
          databaseId: 2,
        });
      } catch {
        // expected
      }
    });

    await waitFor(() => {
      expect(result.current.isError).toBe(true);
    });
    expect(result.current.progress).toBeNull();
  });
});
