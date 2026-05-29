import { ApiProperty } from '@nestjs/swagger';

export class UserAvatarResponseDto {
  @ApiProperty({
    nullable: true,
    description: 'Signed avatar URL when present, otherwise null after deletion',
    example:
      'https://storage.example.com/uploads/avatars/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/avatar.jpg?X-Amz-Algorithm=AWS4-HMAC-SHA256',
  })
  avatarUrl: string | null;
}
