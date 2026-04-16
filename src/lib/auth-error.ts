export function formatAuthError(message: string) {
  const normalizedMessage = message.toLowerCase()

  if (
    normalizedMessage.includes('otp_expired') ||
    normalizedMessage.includes('email link is invalid or has expired') ||
    normalizedMessage.includes('link is invalid or has expired')
  ) {
    return 'That email link has expired. Create the account again or sign in to request a fresh confirmation link.'
  }

  if (normalizedMessage.includes('email rate limit exceeded')) {
    return 'Too many confirmation emails were requested. Wait a few minutes, then sign in with the existing account instead of creating it again.'
  }

  if (normalizedMessage.includes('user already registered')) {
    return 'That email is already registered. Sign in instead, or use the confirmed account to finish setup.'
  }

  if (normalizedMessage.includes('email not confirmed')) {
    return 'Your email is not confirmed yet. Open the latest confirmation email, then sign in with your email once.'
  }

  if (normalizedMessage.includes('invalid login credentials')) {
    return 'The email or password does not match. If you just confirmed your account, try signing in with email first.'
  }

  return message
}
