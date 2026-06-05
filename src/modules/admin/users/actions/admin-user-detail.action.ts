import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { User } from '../../../users/entities/user.entity';
import { Funnel } from '../../../funnels/entities/funnel.entity';
import { UploadedDocument } from '../../../upload/entities/uploaded-document.entity';

@Injectable()
export class AdminUserDetailAction {
  constructor(
    @InjectDataSource()
    private readonly dataSource: DataSource,
  ) {}

  async findUserWithDetails(userId: string): Promise<{
    user: User | null;
    funnels: (Funnel & { stage_count: number })[];
    documents: UploadedDocument[];
  }> {
    const manager = this.dataSource.manager;

    // 1. Fetch user (including soft deleted)
    const user = await manager.findOne(User, {
      where: { id: userId },
      withDeleted: true,
    });

    if (!user) {
      return { user: null, funnels: [], documents: [] };
    }

    // 2. Fetch funnels with stage count
    const funnelsQuery = manager.createQueryBuilder(Funnel, 'f')
      .leftJoin('f.stages', 's')
      .select([
        'f.id',
        'f.funnel_name',
        'f.status',
        'f.created_at'
      ])
      .addSelect('COUNT(s.id)', 'stage_count')
      .where('f.user_id = :userId', { userId })
      .groupBy('f.id');

    const rawFunnels = await funnelsQuery.getRawMany();
    
    const funnels = rawFunnels.map(row => ({
      id: row.f_id,
      funnel_name: row.f_funnel_name,
      status: row.f_status,
      created_at: row.f_created_at,
      stage_count: parseInt(row.stage_count, 10) || 0,
    })) as (Funnel & { stage_count: number })[];

    // 3. Fetch documents
    const documents = await manager.find(UploadedDocument, {
      where: { user_id: userId },
      order: { created_at: 'DESC' },
    });

    return { user, funnels, documents };
  }
}
