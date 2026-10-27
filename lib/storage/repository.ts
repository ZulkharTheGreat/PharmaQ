import { Command, CommandResult, Store, Upload } from "../domain/types";
export interface Repository {
  initialize(): Promise<Store>;
  read(): Promise<Store>;
  dispatch(command: Command, uploads?: Upload[]): Promise<CommandResult>;
  file(id: string): Promise<Blob>;
  exportBackup(): Promise<Blob>;
  restoreBackup(file: Blob, expectedRevision: number): Promise<Store>;
  restoreLegacy(file: Blob): Promise<Store>;
}
