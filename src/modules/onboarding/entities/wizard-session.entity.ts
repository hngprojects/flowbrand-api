import { Column, Entity, Index, JoinColumn, ManyToOne } from "typeorm";
import { WizardSessionStatus } from "../enums/wizard-session.enum";
import { BaseEntity } from "../../../common/entities/base.entity";
import { User } from "../../users/entities/user.entity";

@Entity('wizard_sessions')
export class WizardSession extends BaseEntity {
    @Column({ type: 'enum', enum: WizardSessionStatus, default: WizardSessionStatus.IN_PROGRESS })
    status: WizardSessionStatus;

    @Index()
    @Column({ type: 'uuid'})
    user_id: string

    @Column({ type: 'int', default: 0})
    steps_completed: number

    @Column({ type: 'jsonb', default: {} })
    answers: Record<string, unknown>;

    @Column({ type: 'timestamp with time zone', nullable: true })
    expires_at: Date | null;

    //Relations

    @ManyToOne(() => User, { onDelete: 'CASCADE' })
    @JoinColumn({ name: 'user_id' })
    user: User
}