import type { InterviewEngine } from "./engine";
import { type Answers, EMPTY_ANSWERS, type StepId } from "./types";

export interface InterviewState {
  answers: Answers;
  step: StepId;
  /** Set when the user jumped back from the review to edit one answer. */
  returnToReview: boolean;
  /** Set when the user accepted the recommendation on the review step. */
  accepted: boolean;
}

export const INITIAL_STATE: InterviewState = {
  answers: EMPTY_ANSWERS,
  step: "project",
  returnToReview: false,
  accepted: false,
};

export type InterviewAction =
  | { type: "update"; patch: Partial<Answers> }
  | { type: "replace"; answers: Answers }
  | { type: "next" }
  | { type: "back" }
  | { type: "edit"; step: StepId }
  | { type: "accept" }
  | { type: "reset"; answers?: Partial<Answers> }
  | { type: "hydrate"; state: InterviewState };

export function createReducer(engine: InterviewEngine) {
  return function reducer(state: InterviewState, action: InterviewAction): InterviewState {
    switch (action.type) {
      case "update":
        // Any change to the answers invalidates an earlier acceptance.
        return { ...state, answers: { ...state.answers, ...action.patch }, accepted: false };
      case "replace":
        return { ...state, answers: action.answers, accepted: false };
      case "next": {
        if (!engine.isComplete(state.step, state.answers)) return state;
        const step = engine.next(state.step, state.answers, state.returnToReview);
        return { ...state, step, returnToReview: step === "review" ? false : state.returnToReview };
      }
      case "back": {
        if (state.returnToReview) return { ...state, step: "review", returnToReview: false };
        const step = engine.previous(state.step, state.answers);
        return step ? { ...state, step } : state;
      }
      case "edit":
        return { ...state, step: action.step, returnToReview: true };
      case "accept":
        return { ...state, accepted: true };
      case "reset":
        return { ...INITIAL_STATE, answers: { ...EMPTY_ANSWERS, ...action.answers } };
      case "hydrate":
        return action.state;
    }
  };
}
