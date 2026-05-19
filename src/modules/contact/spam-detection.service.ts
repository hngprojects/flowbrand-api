import { BadRequestException, Injectable } from '@nestjs/common';
import { CreateContactDto } from './dto/create-contact.dto';
import * as SYS_MSG from '../../constants/system.messages';
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
      throw new BadRequestException(SYS_MSG.SPAM_PROHIBITED_CONTENT);
    }
  }

  private checkExcessiveUrls(dto: CreateContactDto): void {
    const urls = dto.message.match(this.urlRegex) ?? [];

    if (urls.length > this.maxUrls) {
      throw new BadRequestException(SYS_MSG.SPAM_TOO_MANY_LINKS);
    }
  }

  private checkRepetitiveContent(dto: CreateContactDto): void {
    const words = dto.message.toLowerCase().split(/\s+/);
    const uniqueWords = new Set(words);
    const uniqueRatio = uniqueWords.size / words.length;

    if (words.length >= 20 && uniqueRatio < this.minUniqueWordRatio) {
      throw new BadRequestException(SYS_MSG.SPAM_EXCESSIVE_REPETITION);
    }
  }

  private checkSuspiciousPatterns(dto: CreateContactDto): void {
    const upperCaseRatio = (dto.message.match(/[A-Z]/g) ?? []).length / dto.message.length;

    if (upperCaseRatio > 0.5 && dto.message.length > 20) {
      throw new BadRequestException(SYS_MSG.SPAM_EXCESSIVE_CAPITALIZATION);
    }

    const hasGibberish = /[bcdfghjklmnpqrstvwxyz]{8,}/i.test(dto.message);

    if (hasGibberish) {
      throw new BadRequestException(SYS_MSG.SPAM_INVALID_CONTENT);
    }

    const emailPattern = /\b[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Z|a-z]{2,}\b/g;
    const emailsInMessage = (dto.message.match(emailPattern) ?? []).length;

    if (emailsInMessage > 1) {
      throw new BadRequestException(SYS_MSG.SPAM_MULTIPLE_EMAILS);
    }
  }
}
