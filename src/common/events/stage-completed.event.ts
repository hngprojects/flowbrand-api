export class StageCompletedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
    public readonly stageId: string,
    public readonly stagePosition: number,
    public readonly stageName: string,
    public readonly unlockedNextStageId: string | null,
    public readonly unlockedNextStageName: string | null,
  ) {}
}
