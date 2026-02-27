-- 邮箱验证功能数据库迁移脚本
-- 执行时间: 2025-01-29

-- 为 users 表添加邮箱验证相关字段
ALTER TABLE `users`
ADD COLUMN `email_verified` TINYINT(1) NULL DEFAULT 0 COMMENT '邮箱是否已验证',
ADD COLUMN `verification_code` VARCHAR(10) NULL COMMENT '邮箱验证码',
ADD COLUMN `verification_expires` TIMESTAMP NULL COMMENT '验证码过期时间',
ADD COLUMN `email_verify_sent_at` TIMESTAMP NULL COMMENT '最后发送验证码的时间';

-- 添加索引以提高查询性能
ALTER TABLE `users`
ADD INDEX `idx_verification_code` (`verification_code`),
ADD INDEX `idx_verification_expires` (`verification_expires`);
