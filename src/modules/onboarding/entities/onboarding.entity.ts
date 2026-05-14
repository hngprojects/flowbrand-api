import { Column, CreateDateColumn, Entity, PrimaryGeneratedColumn, Timestamp, UpdateDateColumn } from "typeorm";

export enum WizardSessionStatus {
    IN_PROGRESS = 'in_progress',
    COMPLETE = 'complete',
    EXPIRED = 'expired'
}

@Entity('wizard_sessions')
export class WizardSession {
    @PrimaryGeneratedColumn('uuid')
    id: string;

    @Column({ type: 'enum', enum: WizardSessionStatus, default: WizardSessionStatus.IN_PROGRESS })
    status: WizardSessionStatus;

    @Column({ type: 'uuid'})
    userId: string

    @Column({ type: 'jsonb' })
    answers: Record<string, unknown>;

    @Column({ type: 'timestamp with time zone', nullable: true })
    expiresAt: Date | null;

    @CreateDateColumn()
    createdAt: Date;

    @UpdateDateColumn()
    updatedAt: Date;
}