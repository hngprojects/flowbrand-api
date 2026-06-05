import { ApiProperty } from '@nestjs/swagger';
import { IsArray, IsEmail, IsString, IsOptional, MinLength, MaxLength, ArrayMinSize, ArrayMaxSize } from 'class-validator';
import { Type } from 'class-transformer';

export class InviteMembersDto {
  @ApiProperty({
    description: 'Array of email addresses (1-20)',
    example: ['member1@example.com', 'member2@example.com'],
    type: [String],
  })
  @IsArray()
  @ArrayMinSize(1)
  @ArrayMaxSize(20)
  @IsEmail({}, { each: true })
  @Type(() => String)
  emails: string[];

  @ApiProperty({ description: 'Role for invited members', example: 'member', default: 'member' })
  @IsString()
  @MinLength(1)
  // TODO: Validate role against allowed values
  role: string;

  @ApiProperty({ description: 'Custom message to include in invite email', required: false })
  @IsOptional()
  @IsString()
  @MaxLength(1000)
  message?: string;
}