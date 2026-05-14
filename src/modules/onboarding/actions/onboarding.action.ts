import { AbstractModelAction } from "@hng-sdk/orm";
import { Injectable } from "@nestjs/common";
import { WizardSession } from "../entities/wizard-session.entity";
import { InjectRepository } from "@nestjs/typeorm";
import { Repository } from "typeorm";
import { WizardSessionStatus } from "../enums/wizard-session.enum";

@Injectable()
export class OnboardingModelAction extends AbstractModelAction<WizardSession> {
    constructor(
        @InjectRepository(WizardSession)
        repository: Repository<WizardSession>
    ) {
        super(repository, WizardSession)
    }

    async findActiveSession(userId: string): Promise<WizardSession | null> {
        return this.repository
            .createQueryBuilder('ws')
            .where('ws.user_id = :userId', { userId })
            .andWhere('ws.status IN (:...statuses)', {
                statuses: ['in_progress', 'complete']
            })
            .orderBy('ws.created_at', 'DESC')
            .limit(1)
            .getOne();
    }

    async markAsExpired(id: string): Promise<void> {
        await this.repository.update(id, { status: WizardSessionStatus.EXPIRED })
    }
}