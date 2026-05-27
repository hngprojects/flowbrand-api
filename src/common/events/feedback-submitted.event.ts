export class FeedbackSubmittedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
    public readonly stageId: string,
    public readonly feedbackId: string,
  ) {}
}
