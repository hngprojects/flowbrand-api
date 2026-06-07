import * as bcrypt from 'bcrypt';
import { DataSource } from 'typeorm';
import { User } from '../../modules/users/entities/user.entity';
import { Seeder } from './seeder.interface';
import { UserRole } from '../../modules/users/enums/user-role.enum';
import { UserRoleEntity } from '../../modules/users/entities/user-role.entity';

/** Validates that a password meets the minimum policy. */
function validatePassword(password: string): void {
  if (password.length < 8) {
    throw new Error('SEED_ADMIN_PASSWORD must be at least 8 characters');
  }
  if (!/[A-Z]/.test(password)) {
    throw new Error('SEED_ADMIN_PASSWORD must contain an uppercase letter');
  }
  if (!/[a-z]/.test(password)) {
    throw new Error('SEED_ADMIN_PASSWORD must contain a lowercase letter');
  }
  if (!/[0-9]/.test(password)) {
    throw new Error('SEED_ADMIN_PASSWORD must contain a digit');
  }
  if (!/[^A-Za-z0-9]/.test(password)) {
    throw new Error('SEED_ADMIN_PASSWORD must contain a special character');
  }
}

export const userSeeder: Seeder = {
  name: 'UserSeeder',
  async run(dataSource: DataSource) {
    const email = process.env.SEED_ADMIN_EMAIL;
    const password = process.env.SEED_ADMIN_PASSWORD;

    if (!email) {
      throw new Error('SEED_ADMIN_EMAIL env var is required');
    }
    if (!password) {
      throw new Error('SEED_ADMIN_PASSWORD env var is required');
    }

    validatePassword(password);

    const roleRepository = dataSource.getRepository(UserRoleEntity);
    const existingSuperAdmin = await roleRepository.findOne({
      where: { role: UserRole.SUPER_ADMIN },
    });

    if (existingSuperAdmin) {
      console.log('[UserSeeder] super_admin already exists — skipping');
      return;
    }

    const passwordHash = await bcrypt.hash(password, 12);
    await dataSource.transaction(async (manager) => {
      const userRepository = manager.getRepository(User);
      const txRoleRepository = manager.getRepository(UserRoleEntity);

      const admin = userRepository.create({
        email,
        password_hash: passwordHash,
        full_name: 'Super Admin',
        termsAccepted: true,
      });
      const savedAdmin = await userRepository.save(admin);

      await txRoleRepository.save({
        user_id: savedAdmin.id,
        role: UserRole.SUPER_ADMIN,
      });
    });

    console.log('[UserSeeder] Super admin created successfully');
  },
};
