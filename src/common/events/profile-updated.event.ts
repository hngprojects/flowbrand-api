export class ProfileUpdatedEvent {
  constructor(
    public readonly userId: string,
    public readonly updatedFields: ReadonlyArray<string>,
  ) {}
}
