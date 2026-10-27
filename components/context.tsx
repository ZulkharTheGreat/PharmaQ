"use client";
import { createContext, useContext } from "react";
import {
  Command,
  CommandResult,
  Person,
  Store,
  Upload,
} from "../lib/domain/types";
import { LocalRepository } from "../lib/storage/local-adapter";
export interface AppContext {
  state: Store;
  user: Person;
  now: string;
  repository: LocalRepository;
  run: (
    type: Command["type"],
    data?: Record<string, unknown>,
    caseId?: string,
    taskId?: string,
    revision?: number,
    uploads?: Upload[],
    occurredAt?: string,
  ) => Promise<CommandResult>;
  open: (id: string, section?: string) => void;
  toast: (message: string) => void;
  confirmNavigation: (action: () => void) => void;
}
export const Context = createContext<AppContext | null>(null);
export function useApp() {
  const value = useContext(Context);
  if (!value) throw new Error("Нет контекста приложения");
  return value;
}
