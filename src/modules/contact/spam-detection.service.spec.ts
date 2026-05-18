import { BadRequestException } from '@nestjs/common';
import { Test, TestingModule } from '@nestjs/testing';
import { SpamDetectionService } from './spam-detection.service';
import { CreateContactDto } from './dto/create-contact.dto';

describe('SpamDetectionService', () => {
  let service: SpamDetectionService;

  beforeEach(async () => {
    const module: TestingModule = await Test.createTestingModule({
      providers: [SpamDetectionService],
    }).compile();

    service = module.get<SpamDetectionService>(SpamDetectionService);
  });

  const validDto: CreateContactDto = {
    fullName: 'Elijah Arhinful',
    email: 'elijah@example.com',
    message: 'I would like to inquire about your funnel building services.',
  };

  it('should pass for a valid submission', () => {
    expect(() => service.validateSubmission(validDto)).not.toThrow();
  });

  it('should throw error if spam keywords are present', () => {
    const spamDto = { ...validDto, message: 'Buy cheap Bitcoin now!' };
    expect(() => service.validateSubmission(spamDto)).toThrow(BadRequestException);
    expect(() => service.validateSubmission(spamDto)).toThrow('Submission contains prohibited content');
  });

  it('should throw error for excessive URLs', () => {
    const linkSpamDto = {
      ...validDto,
      message: 'Check these: http://site1.com, http://site2.com, http://site3.com',
    };
    expect(() => service.validateSubmission(linkSpamDto)).toThrow('Message contains too many links');
  });

  it('should throw error for excessive capitalization (SHOUTING)', () => {
    const shoutingDto = {
      ...validDto,
      message: 'PLEASE CLICK THIS LINK RIGHT NOW IT IS VERY IMPORTANT',
    };
    expect(() => service.validateSubmission(shoutingDto)).toThrow('Message contains excessive capitalization');
  });

  it('should throw error for repetitive content (low unique word ratio)', () => {
    const repetitiveDto = {
      ...validDto,
      message: 'repeat '.repeat(25),
    };
    expect(() => service.validateSubmission(repetitiveDto)).toThrow('Message contains excessive repetition');
  });

  it('should throw error for gibberish (consonant strings)', () => {
    const gibberishDto = {
      ...validDto,
      message: 'Check this bcdfghjklmnp out',
    };
    expect(() => service.validateSubmission(gibberishDto)).toThrow('Message contains invalid content');
  });

  it('should throw error for multiple email addresses in message body', () => {
    const multiEmailDto = {
      ...validDto,
      message: 'Contact me at test1@site.com or test2@site.com for info',
    };
    expect(() => service.validateSubmission(multiEmailDto)).toThrow('Message contains multiple email addresses');
  });
});
