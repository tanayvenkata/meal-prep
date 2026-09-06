import { describe, expect, it } from "vitest";
import { judgeInput, parseAnswerGrade } from "../../../evals/kitchen/answer-grader";
import { answerCases } from "../../../evals/kitchen/answer-cases";

describe("answer grader evidence boundary", () => {
  it("withholds calibration answers and case names from the model", () => {
    for (const reference of answerCases) {
      const input = JSON.parse(judgeInput(reference));
      expect(Object.keys(input).sort()).toEqual(["answer", "events", "final", "initial", "prompt"]);
      expect(input.answer).toBe(reference.answer);
      expect(input.initial).toEqual(reference.initial);
      expect(input.final).toEqual(reference.final);
    }
  });
  it("accepts a complete structured verdict", () => {
    expect(parseAnswerGrade("completed", '{"verdict":"misleading","reason":"No write occurred."}')).toEqual({ verdict: "misleading", reason: "No write occurred." });
  });
  it.each([
    ["incomplete", '{"verdict":"supported","reason":"Looks valid"}'],
    ["completed", ""],
    ["completed", "not json"],
    ["completed", '{"verdict":"supported"}'],
    ["completed", '{"verdict":"supported","reason":""}'],
    ["completed", '{"verdict":"pass","reason":"Wrong enum"}'],
    ["completed", '{"verdict":"supported","reason":"Extra field","pass":true}'],
  ])("keeps ungradeable output ungraded (%s, %s)", (status, output) => {
    expect(parseAnswerGrade(status, output)).toBeUndefined();
  });
});
