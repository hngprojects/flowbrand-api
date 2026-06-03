import { Injectable, Logger, OnModuleInit } from '@nestjs/common';
import * as fs from 'fs/promises';
import * as Handlebars from 'handlebars';
import * as path from 'path';
import { env } from '../config/env';
import type { EmailType } from './interfaces/email-job.interface';

type CompiledTemplate = Handlebars.TemplateDelegate;

const EMAIL_TYPES: EmailType[] = [
  'otp-verification',
  'otp-reset',
  'password-reset',
  'waitlist',
  'contact-confirmation',
  'contact-admin-notification',
  'funnel-ready',
  'stage-unlocked',
  'stage-completed',
  'weekly-digest',
  'payment-successful',
  'payment-failed',
  'subscription-cancelled',
  'notification-alert',
];

@Injectable()
export class TemplateService implements OnModuleInit {
  private readonly logger = new Logger(TemplateService.name);
  private baseLayout: CompiledTemplate;
  private readonly templates = new Map<EmailType, CompiledTemplate>();

  private readonly SUBJECTS: Record<EmailType, string> = {
    'otp-verification': 'Your SEIL verification code',
    'otp-reset': 'Reset your SEIL account',
    'password-reset': 'Password Reset Request - Your OTP Code',
    'waitlist': 'You are on the waitlist',
    'contact-confirmation': "We've received your message",
    'contact-admin-notification': 'New contact form submission from {{fullName}}',
    'funnel-ready': 'Your funnel is ready',
    'stage-unlocked': '"{{stageName}}" is now active',
    'stage-completed': 'You completed "{{stageName}}"',
    'weekly-digest': 'Your weekly SEIL progress',
    'payment-successful': 'Payment Successful — Your FlowBrand subscription is now active',
    'payment-failed': 'Payment Failed — We could not process your payment',
    'subscription-cancelled': 'Your FlowBrand subscription has been cancelled',
    'notification-alert': 'You have {{unreadCount}} new notification(s) from FlowBrand',
  };

  private compiledSubjects: Record<EmailType, Handlebars.TemplateDelegate>;

  async onModuleInit(): Promise<void> {
    const templatesDir = path.join(__dirname, 'templates');

    const baseSource = await fs.readFile(path.join(templatesDir, 'layouts', 'base.hbs'), 'utf8').catch(() => {
      throw new Error('Missing email template: base layout');
    });
    this.baseLayout = Handlebars.compile(baseSource);

    for (const type of EMAIL_TYPES) {
      const source = await fs.readFile(path.join(templatesDir, `${type}.hbs`), 'utf8').catch(() => {
        throw new Error(`Missing email template: ${type}`);
      });
      this.templates.set(type, Handlebars.compile(source));
    }

    this.compiledSubjects = Object.fromEntries(
      Object.entries(this.SUBJECTS).map(([type, subject]) => [type, Handlebars.compile(subject)]),
    ) as Record<EmailType, Handlebars.TemplateDelegate>;

    this.logger.log('Email templates loaded successfully');
  }

  render(type: EmailType, payload: Record<string, unknown>): { html: string; subject: string } {
    const compiled = this.templates.get(type);
    if (!compiled) {
      throw new Error(`No compiled template found for type: ${type}`);
    }

    const urlContext = {
      unsubscribeUrl: `${env.FRONTEND_URL}/unsubscribe`,
      privacyPolicyUrl: `${env.FRONTEND_URL}/privacy-policy`,
      upgradeUrl: `${env.FRONTEND_URL}/upgrade`,
      dashboardUrl: `${env.FRONTEND_URL}/dashboard`,
      notificationPreferencesUrl: `${env.FRONTEND_URL}/settings/notifications`,
    };

    // URL context is merged into the body compiler so CTA hrefs in body templates resolve correctly.
    const body = compiled({ ...payload, ...urlContext });
    const html = this.baseLayout({
      ...payload,
      ...urlContext,
      body,
      year: new Date().getFullYear(),
    });

    const subject = this.compiledSubjects[type](payload);

    return { html, subject };
  }
}
