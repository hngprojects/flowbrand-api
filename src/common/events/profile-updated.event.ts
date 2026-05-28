export class ProfileUpdatedEvent {
  public readonly updatedFields: ReadonlyArray<string>;
  constructor(
    public readonly userId: string,
    updatedFields: ReadonlyArray<string>,
  ) {
    this.updatedFields = Object.freeze([...updatedFields]);
  }
}
