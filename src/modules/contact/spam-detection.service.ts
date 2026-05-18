import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateContactDto } from './dto/create-contact.dto';

@Injectable()
export class SpamDetectionService {
  private readonly spamKeywords = [
    'viagra',
    'cialis',
    'lottery',
    'prize',
    'crypto',
    'bitcoin',
    'casino',
    'pharmacy',
    'weight loss',
    'make money fast',
    'click here',
    'limited time',
  ];

  private readonly urlRegex = /(https?:\/\/[^\s]+)/gi;
  private readonly maxUrls = 2;
  private readonly minUniqueWordRatio = 0.3;

  validateSubmission(dto: CreateContactDto): void {
    const checks = [
      () => this.checkSpamKeywords(dto),
      () => this.checkExcessiveUrls(dto),
      () => this.checkRepetitiveContent(dto),
      () => this.checkSuspiciousPatterns(dto),
    ];

    for (const check of checks) {
      check();
    }
  }

  private checkSpamKeywords(dto: CreateContactDto): void {
    const content = `${dto.message} ${dto.fullName}`.toLowerCase();
    const foundKeywords = this.spamKeywords.filter((keyword) => content.includes(keyword.toLowerCase()));

    if (foundKeywords.length > 0) {
      throw new BadRequestException('Submission contains prohibited content');
    }
  }

  private checkExcessiveUrls(dto: CreateContactDto): void {
    const urls = dto.message.match(this.urlRegex) ?? [];

    if (urls.length > this.maxUrls) {
      throw new BadRequestException('Message contains too many links. Please limit to 2 URLs.');
    }
  }

  private checkRepetitiveContent(dto: CreateContactDto): void {
    const words = dto.message.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const uniqueRatio = uniqueWords.size / words.length;

    if (words.length >= 20 && uniqueRatio < this.minUniqueWordRatio) {
      throw new BadRequestException('Message contains excessive repetition');
    }
  }

  private checkSuspiciousPatterns(dto: CreateContactDto): void {
    const upperCaseRatio = (dto.message.match(/[A-Z]/g) ?? []).length / dto.message.length;

    if (upperCaseRatio > 0.5 && dto.message.length > 20) {
      throw new BadRequestException('Message contains excessive capitalization');
    }

    const hasGibberish = /[bcdfghjklmnpqrstvwxyz]{8,}/i.test(dto.message);

    if (hasGibberish) {
      throw new BadRequestException('Message contains invalid content');
    }

    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emailsInMessage = (dto.message.match(emailPattern) ?? []).length;

    if (emailsInMessage > 1) {
      throw new BadRequestException('Message contains multiple email addresses');
    }
  }
}
