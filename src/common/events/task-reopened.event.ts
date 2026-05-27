export class TaskReopenedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
    public readonly stageId: string,
    public readonly taskId: string,
    public readonly taskName: string,
  ) {}
}
