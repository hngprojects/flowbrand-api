export class FunnelGeneratedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
    public readonly businessName: string,
  ) {}
}
