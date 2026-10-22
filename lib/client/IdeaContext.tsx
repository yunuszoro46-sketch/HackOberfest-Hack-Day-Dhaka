"use client";

import { createContext, useCallback, useContext, useEffect, useReducer, useRef, useState, type ReactNode } from "react";
import type { IdeaCard } from "../schema/ideaCard";
import { withReadiness } from "../readiness";
import { ideaStore } from "../store";

type State = { card: IdeaCard | null; loaded: boolean; dirty: boolean };
type Action = { type: "load"; card: IdeaCard | null } | { type: "update"; fn: (c: IdeaCard) => IdeaCard } | { type: "saved" };

function reducer(state: State, action: Action): State {
  switch (action.type) {
    case "load":
      return { card: action.card, loaded: true, dirty: false };
    case "update": {
      if (!state.card) return state;
      const next = action.fn(state.card);
      if (next === state.card) return state;
      return { ...state, dirty: true, card: withReadiness({ ...next, updatedAt: new Date().toISOString(), version: state.card.version + 1 }) };
    }
    case "saved":
      return { ...state, dirty: false };
  }
}

interface IdeaContextValue {
  card: IdeaCard | null;
  loaded: boolean;
  /** Applies a change; the card is autosaved right after. */
  update: (fn: (c: IdeaCard) => IdeaCard) => void;
  /** Latest card, for async work that must not use a stale closure. */
  latest: () => IdeaCard | null;
  savedAt: number | null;
  saveError: string | null;
}

const Ctx = createContext<IdeaContextValue | null>(null);

export function IdeaProvider({ id, children }: { id: string; children: ReactNode }) {
  const [state, dispatch] = useReducer(reducer, { card: null, loaded: false, dirty: false });
  const [savedAt, setSavedAt] = useState<number | null>(null);
  const [saveError, setSaveError] = useState<string | null>(null);
  const ref = useRef<IdeaCard | null>(null);
  ref.current = state.card;

  useEffect(() => {
    ideaStore().get(id).then((card) => dispatch({ type: "load", card }));
  }, [id]);

  // Autosave on every change.
  useEffect(() => {
    if (!state.dirty || !state.card) return;
    const card = state.card;
    ideaStore()
      .save(card)
      .then(() => {
        setSavedAt(Date.now());
        setSaveError(null);
        dispatch({ type: "saved" });
      })
      .catch((e) => setSaveError((e as Error).message));
  }, [state.card, state.dirty]);

  const update = useCallback((fn: (c: IdeaCard) => IdeaCard) => dispatch({ type: "update", fn }), []);
  const latest = useCallback(() => ref.current, []);
  return <Ctx.Provider value={{ card: state.card, loaded: state.loaded, update, latest, savedAt, saveError }}>{children}</Ctx.Provider>;
}

export function useIdea() {
  const v = useContext(Ctx);
  if (!v) throw new Error("useIdea must be used inside IdeaProvider");
  return v;
}
