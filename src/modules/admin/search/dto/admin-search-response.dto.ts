import { ApiProperty } from '@nestjs/swagger';

export class AdminSearchResultDto {
  @ApiProperty({ example: 'user' })
  type: 'user';

  @ApiProperty({ example: '38a9fa64-c242-4f32-844c-3c32e18d6e35' })
  id: string;

  @ApiProperty({ example: 'John Doe' })
  display_name: string;

  @ApiProperty({ example: 'John Doe' })
  displayName: string;

  @ApiProperty({ example: 'john.doe@example.com' })
  email: string;

  @ApiProperty({ example: 'active', enum: ['active', 'inactive', 'deleted'] })
  status: 'active' | 'inactive' | 'deleted';

  @ApiProperty({ example: 'premium', nullable: true })
  plan: string | null;
}

export class AdminSearchResponseDto {
  @ApiProperty({ type: [AdminSearchResultDto] })
  results: AdminSearchResultDto[];

  @ApiProperty({ example: 'john' })
  query: string;

  @ApiProperty({ example: 1 })
  total: number;
}