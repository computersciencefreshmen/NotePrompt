import nodemailer from 'nodemailer';
import crypto from 'crypto';

// 邮件配置接口
interface EmailConfig {
  host?: string;
  port?: number;
  secure?: boolean;
  auth?: {
    user: string;
    pass: string;
  };
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
  private transporter: nodemailer.Transporter;
  private fromEmail: string;
  private fromName: string;

  constructor() {
    // 从环境变量读取邮件配置
    const emailHost = process.env.EMAIL_HOST || 'smtp.qq.com';
    const emailPort = parseInt(process.env.EMAIL_PORT || '587');
    const emailUser = process.env.EMAIL_USER || '';
    const emailPass = process.env.EMAIL_PASS || '';
    const emailSecure = process.env.EMAIL_SECURE === 'true';

    // 发件人信息
    this.fromEmail = process.env.EMAIL_FROM || emailUser;
    this.fromName = process.env.EMAIL_FROM_NAME || 'Note Prompt';

    // 创建邮件传输器
    this.transporter = nodemailer.createTransport({
      host: emailHost,
      port: emailPort,
      secure: emailSecure, // true for 465, false for other ports
      auth: {
        user: emailUser,
        pass: emailPass,
      },
    });

    // 验证配置
    this.verifyConfig();
  }

  /**
   * 验证邮件配置
   */
  private async verifyConfig(): Promise<void> {
    try {
      await this.transporter.verify();

    } catch (error) {
      console.warn('邮件服务配置验证失败:', error);
      console.warn('请检查环境变量 EMAIL_HOST, EMAIL_USER, EMAIL_PASS');
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

    try {
      const info = await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to,
        subject,
        html,
      });

      return true;
    } catch (error) {
      console.error('验证码邮件发送失败:', error);
      throw new Error('邮件发送失败，请稍后重试');
    }
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

    try {
      await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to,
        subject,
        html,
      });

      return true;
    } catch (error) {
      console.error('密码重置邮件发送失败:', error);
      throw new Error('邮件发送失败，请稍后重试');
    }
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
      const info = await this.transporter.sendMail({
        from: `"${this.fromName}" <${this.fromEmail}>`,
        to,
        subject,
        html,
      });

      return true;
    } catch (error) {
      console.error('密码重置邮件发送失败:', error);
      return false;
    }
  }
}

// 导出单例
export const emailService = new EmailService();
