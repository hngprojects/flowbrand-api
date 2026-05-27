import { AbstractModelAction } from '@hng-sdk/orm';
import { Injectable } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { StageFeedback } from '../entities/stage-feedback.entity';

@Injectable()
export class StageFeedbackModelAction extends AbstractModelAction<StageFeedback> {
  constructor(
    @InjectRepository(StageFeedback)
    private readonly stageFeedbackRepository: Repository<StageFeedback>,
  ) {
    super(stageFeedbackRepository, StageFeedback);
  }

  async findExistingFeedback(userId: string, stageId: string): Promise<StageFeedback | null> {
    return this.stageFeedbackRepository.findOne({
      where: { user_id: userId, stage_id: stageId },
    });
  }

  async createFeedback(userId: string, funnelId: string, stageId: string, comment: string): Promise<StageFeedback> {
    const feedback = this.stageFeedbackRepository.create({
      user_id: userId,
      funnel_id: funnelId,
      stage_id: stageId,
      comment,
    });
    return this.stageFeedbackRepository.save(feedback);
  }
}