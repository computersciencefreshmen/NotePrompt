export const PASSWORD_MIN_LENGTH = 8
export const PASSWORD_MAX_LENGTH = 128
export const PASSWORD_POLICY_ERROR = '密码必须为8-128位，并同时包含大写字母、小写字母和数字'

export function isPasswordPolicyCompliant(password: unknown): password is string {
  return typeof password === 'string' &&
    password.length >= PASSWORD_MIN_LENGTH &&
    password.length <= PASSWORD_MAX_LENGTH &&
    /[a-z]/.test(password) &&
    /[A-Z]/.test(password) &&
    /\d/.test(password)
}

export function getPasswordPolicyError(password: unknown): string | null {
  return isPasswordPolicyCompliant(password) ? null : PASSWORD_POLICY_ERROR
}
