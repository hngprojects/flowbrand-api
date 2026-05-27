export class StageUnlockedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
    public readonly stageId: string,
    public readonly stagePosition: number,
    public readonly stageName: string,
  ) {}
}
