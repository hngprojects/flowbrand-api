import { Test, TestingModule } from '@nestjs/testing';
import * as fs from 'fs/promises';
import { TemplateService } from '../template.service';

jest.mock('fs/promises');
const mockReadFile = fs.readFile as jest.MockedFunction<typeof fs.readFile>;

const BASE_HBS = `<!DOCTYPE html><html><body>{{{body}}} {{year}} <a href="{{unsubscribeUrl}}">Unsubscribe</a> <a href="{{privacyPolicyUrl}}">Privacy</a></body></html>`;
const OTP_VERIFICATION_HBS = `<p>Hello {{fullName}}</p><p>{{otpCode}}</p><p>{{expiryMins}} minutes</p>`;
const OTP_RESET_HBS = `<p>Hello {{fullName}}</p><p>{{otpCode}}</p><p>{{expiryMins}} minutes</p>`;
const WAITLIST_HBS = `<p>Hi {{user.name}}</p><p>You are on the waitlist</p>`;
const CONTACT_CONFIRMATION_HBS = `<p>Hi {{fullName}}</p><p>We've received your message</p>`;
const CONTACT_ADMIN_HBS = `<p>New message from {{fullName}}</p><p>{{message}}</p>`;
const PASSWORD_RESET_HBS = `<p>Hi {{fullName}}</p><p>Your reset code is {{otpCode}}</p>`;
const FUNNEL_READY_HBS = `<p>Hi {{name}}</p><p>Your funnel for {{businessName}} is ready</p>`;
const STAGE_UNLOCKED_HBS = `<p>Hi {{name}}</p><p><a href="{{dashboardUrl}}">SEIL</a> {{stageName}} is now active</p>`;
const STAGE_COMPLETED_HBS = `<p>Hi {{name}}</p><p>You completed {{stageName}}</p><p>Open <a href="{{dashboardUrl}}">SEIL</a></p>`;
const WEEKLY_DIGEST_HBS = `<p>Hi {{name}}</p><p>{{completedTasks}} of {{totalTasks}}</p>`;
const TEAM_INVITE_HBS = `<p>Hi {{inviteeName}}</p><p>You have been invited to {{teamName}}</p><p><a href="{{inviteUrl}}">Join</a></p>`;


describe('TemplateService', () => {
  let service: TemplateService;

  function buildService(): Promise<TestingModule> {
     return Test.createTestingModule({ providers: [TemplateService] }).compile();
  }

  describe('onModuleInit - happy path', () => {
    beforeEach(async () => {
      mockReadFile.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('base.hbs')) return Promise.resolve(BASE_HBS as never);
        if (p.includes('otp-verification')) return Promise.resolve(OTP_VERIFICATION_HBS as never);
        if (p.includes('otp-reset')) return Promise.resolve(OTP_RESET_HBS as never);
        if (p.includes('password-reset')) return Promise.resolve(PASSWORD_RESET_HBS as never);
        if (p.includes('waitlist')) return Promise.resolve(WAITLIST_HBS as never);
        if (p.includes('contact-confirmation')) return Promise.resolve(CONTACT_CONFIRMATION_HBS as never);
        if (p.includes('contact-admin-notification')) return Promise.resolve(CONTACT_ADMIN_HBS as never);
        if (p.includes('funnel-ready')) return Promise.resolve(FUNNEL_READY_HBS as never);
        if (p.includes('stage-unlocked')) return Promise.resolve(STAGE_UNLOCKED_HBS as never);
        if (p.includes('stage-completed')) return Promise.resolve(STAGE_COMPLETED_HBS as never);
        if (p.includes('weekly-digest')) return Promise.resolve(WEEKLY_DIGEST_HBS as never);
        if (p.includes('team-invite')) return Promise.resolve(TEAM_INVITE_HBS as never);
        return Promise.reject(new Error(`Unexpected path: ${p}`));
      });

      const module = await buildService();
      service = module.get<TemplateService>(TemplateService);
      await service.onModuleInit();
    });

    afterEach(() => jest.clearAllMocks());

    it('renders otp-verification with correct variables', () => {
      const { html, subject } = service.render('otp-verification', {
        fullName: 'Ada',
        otpCode: '123456',
        expiryMins: 5,
      });

      expect(html).toContain('123456');
      expect(html).toContain('Ada');
      expect(html).toContain('5');
      expect(subject).toBe('Your SEIL verification code');
    });

    it('renders otp-reset with correct variables', () => {
      const { html, subject } = service.render('otp-reset', {
        fullName: 'Bob',
        otpCode: '654321',
        expiryMins: 10,
      });

      expect(html).toContain('654321');
      expect(html).toContain('Bob');
      expect(html).toContain('10');
      expect(subject).toBe('Reset your SEIL account');
    });

    it('renders waitlist with correct variables', () => {
      const { html, subject } = service.render('waitlist', {
        user: { name: 'Charlie' },
      });

      expect(html).toContain('Charlie');
      expect(html).toContain('waitlist');
      expect(html).toContain('/privacy-policy');
      expect(subject).toBe('You are on the waitlist');
    });

    it('renders funnel-ready with name and business name', () => {
      const { html, subject } = service.render('funnel-ready', { name: 'Ada', businessName: 'Acme' });

      expect(html).toContain('Ada');
      expect(html).toContain('Acme');
      expect(subject).toBe('Your funnel is ready');
    });

    it('renders stage-unlocked with the stage name interpolated into the subject', () => {
      const { html, subject } = service.render('stage-unlocked', { name: 'Ada', stageName: 'Interest' });

      expect(html).toContain('Interest');
      expect(html).toContain('/dashboard');
      expect(html).toContain('>SEIL<');
      expect(subject).toBe('"Interest" is now active');
    });

    it('renders stage-completed with the stage name interpolated into the subject', () => {
      const { html, subject } = service.render('stage-completed', { name: 'Ada', stageName: 'Awareness' });

      expect(html).toContain('Awareness');
      expect(html).toContain('/dashboard');
      expect(html).toContain('>SEIL<');
      expect(subject).toBe('You completed "Awareness"');
    });

    it('renders weekly-digest with task counts', () => {
      const { html, subject } = service.render('weekly-digest', {
        name: 'Ada',
        completedTasks: 3,
        totalTasks: 6,
        activeStageName: null,
      });

      expect(html).toContain('3');
      expect(html).toContain('6');
      expect(subject).toBe('Your weekly SEIL progress');
    });

    it('wraps inner content in base layout (contains DOCTYPE)', () => {
      const { html } = service.render('otp-verification', {
        fullName: 'Ada',
        otpCode: '000000',
        expiryMins: 5,
      });

      expect(html).toContain('<!DOCTYPE html>');
    });

    it('includes current year and unsubscribe URL in rendered html', () => {
      const { html } = service.render('otp-verification', {
        fullName: 'Ada',
        otpCode: '000000',
        expiryMins: 5,
      });

      expect(html).toContain(String(new Date().getFullYear()));
      expect(html).toContain('/unsubscribe');
    });
  });

  describe('onModuleInit - missing template', () => {
    it('throws when a template file is missing', async () => {
      mockReadFile.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('base.hbs')) return Promise.resolve(BASE_HBS as never);
        return Promise.reject(new Error('ENOENT'));
      });

      const module = await buildService();
      service = module.get<TemplateService>(TemplateService);

      await expect(service.onModuleInit()).rejects.toThrow('Missing email template');
    });
  });

  describe('render - unknown type', () => {
    it('throws when template for type is not compiled', async () => {
      const module = await buildService();
      service = module.get<TemplateService>(TemplateService);
      // onModuleInit intentionally NOT called - templates map stays empty

      expect(() =>
        service.render('otp-verification' as never, {}),
      ).toThrow('No compiled template found for type');
    });
  });
});
