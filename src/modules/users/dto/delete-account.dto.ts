import { ApiProperty } from "@nestjs/swagger";
import { IsString, Matches } from "class-validator";

export class DeleteAccountDto {
  @ApiProperty({
    description: 'Must be exactly "DELETE" (case-sensitive)',
    example: 'DELETE',
    required: true,
  })
  @IsString()
  @Matches(/^DELETE$/, {
    message: 'You must type DELETE to confirm account deletion'
  })
  confirmation: string;
}