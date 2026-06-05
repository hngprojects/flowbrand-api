// Funnel lifecycle
export class FunnelGeneratedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
    public readonly businessName: string,
  ) {}
}

export class FunnelFailedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
  ) {}
}

export class FunnelRenamedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
    public readonly oldName: string,
    public readonly newName: string,
  ) {}
}

// Stage progression
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

export class StageUnlockedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
    public readonly stageId: string,
    public readonly stagePosition: number,
    public readonly stageName: string,
  ) {}
}

// Task interactions
export class TaskCompletedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
    public readonly stageId: string,
    public readonly taskId: string,
    public readonly taskName: string,
  ) {}
}

export class TaskReopenedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
    public readonly stageId: string,
    public readonly taskId: string,
    public readonly taskName: string,
  ) {}
}

// Feedback
export class FeedbackSubmittedEvent {
  constructor(
    public readonly userId: string,
    public readonly funnelId: string,
    public readonly stageId: string,
    public readonly feedbackId: string,
  ) {}
}

// User account
export class ProfileUpdatedEvent {
  public readonly updatedFields: ReadonlyArray<string>;
  constructor(
    public readonly userId: string,
    updatedFields: ReadonlyArray<string>,
  ) {
    this.updatedFields = Object.freeze([...updatedFields]);
  }
}

export class PasswordChangedEvent {
  constructor(public readonly userId: string) {}
}

export class AccountDeletedEvent {
  constructor(public readonly userId: string) {}
}

export class UserSignedInEvent {
  constructor(
    public readonly userId: string,
    public readonly ip: string,
    public readonly userAgent: string,
  ) {}
}

export class UserSignedUpEvent {
  constructor(
    public readonly userId: string,
    public readonly ip: string,
    public readonly userAgent: string,
  ) {}
}
