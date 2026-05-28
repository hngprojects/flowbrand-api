export class UserSignedInEvent {
  constructor(
    public readonly userId: string,
    public readonly ip: string,
    public readonly userAgent: string,
  ) {}
}
