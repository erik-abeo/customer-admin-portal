import { afterEach, describe, expect, it, vi } from "vitest";

import { downloadCsv, toCsv } from "./csv";

describe("toCsv", () => {
  it("renders a header row and simple cells", () => {
    expect(toCsv(["a", "b"], [["1", "2"]])).toBe("a,b\r\n1,2");
  });

  it("quotes cells containing commas", () => {
    expect(toCsv(["x"], [["hello, world"]])).toBe('x\r\n"hello, world"');
  });

  it("escapes embedded quotes by doubling them", () => {
    expect(toCsv(["x"], [['she said "hi"']])).toBe('x\r\n"she said ""hi"""');
  });

  it("quotes cells containing newlines", () => {
    expect(toCsv(["x"], [["line1\nline2"]])).toBe('x\r\n"line1\nline2"');
  });

  it("treats null and undefined as empty cells", () => {
    expect(toCsv(["a", "b", "c"], [[null, undefined, "ok"]])).toBe("a,b,c\r\n,,ok");
  });

  it("stringifies numbers and booleans", () => {
    expect(toCsv(["n", "b"], [[42, true]])).toBe("n,b\r\n42,true");
  });

  it("handles multiple rows", () => {
    const csv = toCsv(
      ["id", "name"],
      [
        [1, "alpha"],
        [2, "beta"],
      ],
    );
    expect(csv).toBe("id,name\r\n1,alpha\r\n2,beta");
  });
});

describe("downloadCsv", () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it("creates a hidden anchor, clicks it, and revokes the URL", () => {
    const createObjectURL = vi
      .spyOn(URL, "createObjectURL")
      .mockReturnValue("blob:fake");
    const revokeObjectURL = vi
      .spyOn(URL, "revokeObjectURL")
      .mockImplementation(() => undefined);
    const click = vi.fn();
    const realCreateElement = document.createElement.bind(document);
    vi.spyOn(document, "createElement").mockImplementation((tag) => {
      const el = realCreateElement(tag);
      if (tag === "a") {
        Object.defineProperty(el, "click", { value: click });
      }
      return el;
    });

    vi.useFakeTimers();
    downloadCsv("test.csv", "a,b\r\n1,2");
    vi.advanceTimersByTime(2000);
    vi.useRealTimers();

    expect(createObjectURL).toHaveBeenCalledTimes(1);
    expect(click).toHaveBeenCalledTimes(1);
    expect(revokeObjectURL).toHaveBeenCalledWith("blob:fake");
  });
});
