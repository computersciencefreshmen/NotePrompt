import nodemailer from 'nodemailer';
import crypto from 'crypto';

// 邮件配置接口
interface EmailConfig {
  host: string;
  port: number;
  secure: boolean;
  auth: {
    user: string;
    pass: string;
  };
}

interface EmailEnvironment {
  EMAIL_HOST?: string;
  EMAIL_PORT?: string;
  EMAIL_SECURE?: string;
  EMAIL_USER?: string;
  EMAIL_PASS?: string;
  EMAIL_FROM?: string;
  EMAIL_FROM_NAME?: string;
}

type MailTransporter = Pick<nodemailer.Transporter, 'sendMail'>;
type EmailEnvironmentProvider = () => EmailEnvironment;
type TransporterFactory = (config: EmailConfig) => MailTransporter;

interface EmailClient {
  transporter: MailTransporter;
  fromEmail: string;
  fromName: string;
}

function readEmailEnvironment(): EmailEnvironment {
  return {
    EMAIL_HOST: process.env.EMAIL_HOST,
    EMAIL_PORT: process.env.EMAIL_PORT,
    EMAIL_SECURE: process.env.EMAIL_SECURE,
    EMAIL_USER: process.env.EMAIL_USER,
    EMAIL_PASS: process.env.EMAIL_PASS,
    EMAIL_FROM: process.env.EMAIL_FROM,
    EMAIL_FROM_NAME: process.env.EMAIL_FROM_NAME,
  };
}

function createMailTransporter(config: EmailConfig): MailTransporter {
  return nodemailer.createTransport(config);
}

// 验证码邮件模板
interface VerificationEmailData {
  to: string;
  username: string;
  code: string;
}

/**
 * 邮件服务类
 * 用于发送邮箱验证相关邮件
 */
export class EmailService {
  private client: EmailClient | null = null;
  private readonly environmentProvider: EmailEnvironmentProvider;
  private readonly transporterFactory: TransporterFactory;

  constructor(
    environmentProvider: EmailEnvironmentProvider = readEmailEnvironment,
    transporterFactory: TransporterFactory = createMailTransporter,
  ) {
    this.environmentProvider = environmentProvider;
    this.transporterFactory = transporterFactory;
  }

  private getClient(): EmailClient {
    if (this.client) return this.client;

    const environment = this.environmentProvider();
    const emailUser = environment.EMAIL_USER?.trim() || '';
    const emailPass = environment.EMAIL_PASS || '';
    if (!emailUser || !emailPass) {
      throw new Error('Email delivery is not configured');
    }

    const emailPort = Number(environment.EMAIL_PORT || '587');
    if (!Number.isSafeInteger(emailPort) || emailPort <= 0 || emailPort > 65535) {
      throw new Error('Email delivery is not configured');
    }

    const secureValue = environment.EMAIL_SECURE?.trim().toLowerCase() || 'false';
    if (secureValue !== 'true' && secureValue !== 'false') {
      throw new Error('Email delivery is not configured');
    }

    this.client = {
      transporter: this.transporterFactory({
        host: environment.EMAIL_HOST?.trim() || 'smtp.qq.com',
        port: emailPort,
        secure: secureValue === 'true',
        auth: { user: emailUser, pass: emailPass },
      }),
      fromEmail: environment.EMAIL_FROM?.trim() || emailUser,
      fromName: environment.EMAIL_FROM_NAME?.trim() || 'Note Prompt',
    };

    return this.client;
  }

  private async deliver(to: string, subject: string, html: string): Promise<boolean> {
    try {
      const client = this.getClient();
      await client.transporter.sendMail({
        from: `"${client.fromName}" <${client.fromEmail}>`,
        to,
        subject,
        html,
      });
      return true;
    } catch {
      throw new Error('邮件发送失败，请稍后重试');
    }
  }

  /**
   * 生成6位数字验证码（使用密码学安全的随机数生成器）
   */
  generateVerificationCode(): string {
    return crypto.randomInt(100000, 1000000).toString();
  }

  /**
   * 获取验证码过期时间（默认10分钟）
   */
  getVerificationExpiry(minutes: number = 10): Date {
    const expiry = new Date();
    expiry.setMinutes(expiry.getMinutes() + minutes);
    return expiry;
  }

  /**
   * 发送邮箱验证码邮件
   */
  async sendVerificationEmail(data: VerificationEmailData): Promise<boolean> {
    const { to, username, code } = data;

    // 邮件主题和内容
    const subject = '【Note Prompt】邮箱验证码';
    const html = this.getVerificationEmailTemplate(username, code);

    return this.deliver(to, subject, html);
  }

  /**
   * 获取验证码邮件HTML模板
   */
  private getVerificationEmailTemplate(username: string, code: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .code { font-size: 32px; font-weight: bold; color: #667eea; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; letter-spacing: 5px; }
    .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
    .button { display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px; margin: 20px 0; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>📧 Note Prompt</h1>
      <p>欢迎加入我们！</p>
    </div>
    <div class="content">
      <h2>你好，${username}！</h2>
      <p>感谢您注册 Note Prompt。为了确保账户安全，请使用以下验证码完成邮箱验证：</p>

      <div class="code">${code}</div>

      <p><strong>验证码有效期为 10 分钟，请尽快完成验证。</strong></p>

      <div class="warning">
        <strong>⚠️ 安全提示：</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>请勿将验证码告知他人</li>
          <li>我们不会主动索要您的验证码</li>
          <li>如果这不是您的操作，请忽略此邮件</li>
        </ul>
      </div>

      <p>如果您没有注册 Note Prompt 账户，请忽略此邮件。</p>

      <div class="footer">
        <p>此邮件由系统自动发送，请勿直接回复。</p>
        <p>© ${new Date().getFullYear()} Note Prompt. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * 发送密码重置验证码邮件
   */
  async sendPasswordResetCodeEmail(data: VerificationEmailData): Promise<boolean> {
    const { to, username, code } = data;

    const subject = '【Note Prompt】密码重置验证码';
    const html = this.getPasswordResetEmailTemplate(username, code);

    return this.deliver(to, subject, html);
  }

  /**
   * 获取密码重置邮件HTML模板
   */
  private getPasswordResetEmailTemplate(username: string, code: string): string {
    return `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #e74c3c 0%, #c0392b 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
    .code { font-size: 32px; font-weight: bold; color: #e74c3c; text-align: center; padding: 20px; background: white; border-radius: 8px; margin: 20px 0; letter-spacing: 5px; }
    .footer { text-align: center; margin-top: 30px; color: #999; font-size: 12px; }
    .warning { background: #fff3cd; border-left: 4px solid #ffc107; padding: 15px; margin: 20px 0; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 Note Prompt</h1>
      <p>密码重置验证</p>
    </div>
    <div class="content">
      <h2>你好，${username}！</h2>
      <p>我们收到了您的密码重置请求。请使用以下验证码完成密码重置：</p>

      <div class="code">${code}</div>

      <p><strong>验证码有效期为 10 分钟，请尽快完成操作。</strong></p>

      <div class="warning">
        <strong>⚠️ 安全提示：</strong>
        <ul style="margin: 10px 0; padding-left: 20px;">
          <li>请勿将验证码告知他人</li>
          <li>我们不会主动索要您的验证码</li>
          <li>如果这不是您的操作，请忽略此邮件并检查账户安全</li>
        </ul>
      </div>

      <p>如果您没有请求重置密码，请忽略此邮件，您的密码不会被更改。</p>

      <div class="footer">
        <p>此邮件由系统自动发送，请勿直接回复。</p>
        <p>&copy; ${new Date().getFullYear()} Note Prompt. All rights reserved.</p>
      </div>
    </div>
  </div>
</body>
</html>
    `;
  }

  /**
   * 发送密码重置邮件（预留功能）
   */
  async sendPasswordResetEmail(to: string, resetToken: string): Promise<boolean> {
    const subject = '【Note Prompt】密码重置';
    const resetUrl = `${process.env.NEXTAUTH_URL}/reset-password?token=${resetToken}`;

    const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <style>
    body { font-family: Arial, sans-serif; line-height: 1.6; color: #333; }
    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
    .header { background: linear-gradient(135deg, #667eea 0%, #764ba2 100%); color: white; padding: 30px; text-align: center; border-radius: 10px 10px 0 0; }
    .content { background: #f9f9f9; padding: 30px; border-radius: 0 0 10px 10px; }
  </style>
</head>
<body>
  <div class="container">
    <div class="header">
      <h1>🔐 密码重置</h1>
    </div>
    <div class="content">
      <h2>您请求重置密码</h2>
      <p>点击下方按钮重置您的密码：</p>
      <div style="text-align: center; margin: 30px 0;">
        <a href="${resetUrl}" style="display: inline-block; padding: 12px 30px; background: #667eea; color: white; text-decoration: none; border-radius: 5px;">重置密码</a>
      </div>
      <p>或者复制以下链接到浏览器：</p>
      <p style="background: #fff; padding: 10px; border-radius: 5px; word-break: break-all;">${resetUrl}</p>
      <p><strong>此链接30分钟后过期。</strong></p>
    </div>
  </div>
</body>
</html>
    `;

    try {
      return await this.deliver(to, subject, html);
    } catch {
      return false;
    }
  }
}

// 导出单例
export const emailService = new EmailService();
