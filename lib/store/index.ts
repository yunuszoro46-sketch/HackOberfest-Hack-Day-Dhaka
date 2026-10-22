"use client";

import type { IdeaStore } from "./IdeaStore";
import { LocalStorageIdeaStore } from "./localStorageStore";

let store: IdeaStore | null = null;

/** The app's store. Browser-only. */
export function ideaStore(): IdeaStore {
  store ??= new LocalStorageIdeaStore(window.localStorage);
  return store;
}
