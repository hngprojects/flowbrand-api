export class FunnelFailedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
  ) {}
}
