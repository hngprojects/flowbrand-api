import { ApiProperty } from "@nestjs/swagger";
import { Type } from "class-transformer";
import {
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
    Validate,
    ValidateNested,
    ValidationArguments,
    ValidatorConstraint,
    ValidatorConstraintInterface,
} from "class-validator";

export class Step1AnswerDto {
    @ApiProperty({ description: 'Business Description', minLength: 1, maxLength: 500 })
    @IsString()
    @MinLength(1)
    @MaxLength(500, { message: 'Business description must be 500 characters or less' })
    business_description: string
}

@ValidatorConstraint({ name: 'tagsOrNotes' })
class TagsOrNotesConstraint implements ValidatorConstraintInterface {
    validate(_: unknown, args: ValidationArguments): boolean {
        const dto = args.object as Step2AnswerDto;
        const hasType = Array.isArray(dto.customer_tags?.type) && dto.customer_tags.type.length > 0;
        const hasNotes = typeof dto.additional_notes === 'string' && dto.additional_notes.trim().length > 0;
        return hasType || hasNotes;
    }

    defaultMessage(): string {
        return 'Select at least one customer tag, or describe your customer in the notes field.';
    }
}

class CustomerTagsDto {
    @ApiProperty({ description: 'Customer Types', type: [String], required: false })
    @IsOptional()
    @IsArray()
    @IsString({ each: true })
    type?: string[];

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
    @Validate(TagsOrNotesConstraint)
    @ValidateNested()
    @Type(() => CustomerTagsDto)
    customer_tags: CustomerTagsDto;

    @ApiProperty({ required: false, maxLength: 500 })
    @IsOptional()
    @IsString()
    @MaxLength(500, { message: 'Additional notes must be 500 characters or less' })
    additional_notes?: string
}

export enum DiscoveryChannel {
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