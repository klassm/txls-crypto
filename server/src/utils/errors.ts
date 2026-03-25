export class HassSupervisorError extends Error {
  constructor(message: string) {
    super(message);
    this.name = "HassSupervisorError";
  }
}
