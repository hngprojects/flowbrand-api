import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import { 
    ArrayMinSize,
    IsArray,
    IsEnum,
    IsInt,
    IsNotEmpty,
    IsOptional,
    IsString, 
    IsUUID, 
    Max, 
    MaxLength, 
    Min, 
    MinLength, 
    ValidateNested
} from "class-validator";

export class Step1AnswerDto {
    @ApiProperty({ description: 'Business Description', minLength: 1, maxLength: 500 })
    @IsString()
    @MinLength(1)
    @MaxLength(500)
    business_description: string
}

class CustomerTagsDto {
    @ApiProperty({ description: 'Customer Types', type: [String] })
    @IsNotEmpty()
    @IsArray()
    @IsString({ each: true })
    @ArrayMinSize(1)
    type: string[];

    @ApiProperty({ required: false, type: [String]})
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    location?: string[]

    @ApiProperty({ required: false, type: [String]})
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    wants?: string[]

}

export class Step2AnswerDto {
    @ApiProperty({ type: CustomerTagsDto })
    @ValidateNested()
    @Type(() => CustomerTagsDto)
    customer_tags: CustomerTagsDto;

    @ApiProperty({ required: false, maxLength: 300 })
    @IsOptional()
    @IsString()
    @MaxLength(300)
    additional_notes?: string 
}

enum DiscoveryChannel {
  INSTAGRAM = 'Instagram',
  FACEBOOK = 'Facebook',
  TIKTOK = 'TikTok',
  PHYSICAL_LOCATION = 'Physical Location',
  OTHERS = 'Others',
}

export class Step3AnswerDto {
  @ApiProperty({ enum: DiscoveryChannel })
  @IsEnum(DiscoveryChannel)
  discovery_channel: DiscoveryChannel;
}

export class StepAnswerDto {
    @ApiProperty({ description: 'The wizard session ID' })
    @IsUUID()
    session_id: string;

    @ApiProperty({ description: 'Step number', minimum: 1, maximum: 3 })
    @IsInt()
    @Min(1)
    @Max(3)
    step: number;

    @ApiProperty({ description: 'The answer object - shape depends on step number' })
    @IsNotEmpty()
    answer: Record<string, unknown>
}