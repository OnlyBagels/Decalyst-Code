import { describe, it, expect } from "vitest";
import { extractJsonObject } from "../src/utils/json.js";
import { SwarmError } from "../src/utils/errors.js";

describe("extractJsonObject", () => {
  it("parses clean JSON", () => {
    expect(extractJsonObject('{"a":1}')).toEqual({ a: 1 });
  });

  it("strips ```json fences", () => {
    expect(extractJsonObject('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("strips bare ``` fences", () => {
    expect(extractJsonObject('```\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("extracts JSON object embedded in prose", () => {
    expect(
      extractJsonObject(
        'Here is your output:\n{"a":1,"b":[2,3]}\nlet me know if that helps.',
      ),
    ).toEqual({ a: 1, b: [2, 3] });
  });

  it("handles nested braces in strings", () => {
    expect(extractJsonObject('{"a":"hello {world}"}')).toEqual({
      a: "hello {world}",
    });
  });

  it("handles escaped quotes", () => {
    expect(extractJsonObject('{"a":"say \\"hi\\""}')).toEqual({
      a: 'say "hi"',
    });
  });

  it("throws on no JSON", () => {
    expect(() => extractJsonObject("nothing here at all")).toThrow(SwarmError);
  });
});
