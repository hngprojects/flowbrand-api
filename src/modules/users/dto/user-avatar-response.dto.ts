import { ApiProperty } from '@nestjs/swagger';

export class UserAvatarResponseDto {
  @ApiProperty({
    nullable: true,
    description:
      'Public avatar URL when present (browser-readable), otherwise null after deletion',
    example:
      'https://staging.flowbrand.hng14.com/flowbrand-staging-uploads/avatars/aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa/avatar.jpg',
  })
  avatarUrl: string | null;
}
