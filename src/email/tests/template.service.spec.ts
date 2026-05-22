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
const PASSWORD_RESET_HBS = `<p>Hello {{fullName}}</p><p>{{otpCode}}</p><p>{{expiryMins}} minutes</p>`;

describe('TemplateService', () => {
  let service: TemplateService;

  function buildService(): Promise<TestingModule> {
    return Test.createTestingModule({ providers: [TemplateService] }).compile();
  }

  describe('onModuleInit — happy path', () => {
    beforeEach(async () => {
      mockReadFile.mockImplementation((filePath) => {
        const p = String(filePath);
        if (p.includes('base.hbs')) return Promise.resolve(BASE_HBS as never);
        if (p.includes('otp-verification')) return Promise.resolve(OTP_VERIFICATION_HBS as never);
        if (p.includes('otp-reset')) return Promise.resolve(OTP_RESET_HBS as never);
        if (p.includes('waitlist')) return Promise.resolve(WAITLIST_HBS as never);
        if (p.includes('contact-confirmation')) return Promise.resolve(CONTACT_CONFIRMATION_HBS as never);
        if (p.includes('contact-admin-notification')) return Promise.resolve(CONTACT_ADMIN_HBS as never);
        if (p.includes('password-reset')) return Promise.resolve(PASSWORD_RESET_HBS as never);
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

  describe('onModuleInit — missing template', () => {
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

  describe('render — unknown type', () => {
    it('throws when template for type is not compiled', async () => {
      const module = await buildService();
      service = module.get<TemplateService>(TemplateService);
      // onModuleInit intentionally NOT called — templates map stays empty

      expect(() =>
        service.render('otp-verification' as never, {}),
      ).toThrow('No compiled template found for type');
    });
  });
});
