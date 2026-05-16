import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { Seeder } from './seeder.interface';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { UserRoleEntity } from '../../modules/users/entities/user-role.entity';

export const userSeeder: Seeder = {
  name: 'UserSeeder',
  async run(dataSource: DataSource) {
    const repository = dataSource.getRepository(User);

    const adminEmail = 'admin@example.com';
    const existing = await repository.findOne({ where: { email: adminEmail } });
    if (existing) {
      console.log(`[UserSeeder] ${adminEmail} already exists — skipping`);
      return;
    }

    const admin = repository.create({
      email: adminEmail,
      password_hash: await bcrypt.hash('Admin@123456', 10),
      full_name: 'Admin User',
      termsAccepted: true,
    });
    const savedAdmin = await repository.save(admin);

    const roleRepostory = dataSource.getRepository(UserRoleEntity);
    await roleRepostory.save({ user_id: savedAdmin.id, role: UserRole.ADMIN });
  },
};
