import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendMagicLink(email: string, token: string) {
  const resend = getResend();
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const link = `${baseUrl}/api/auth/verify?token=${token}`;

  await resend.emails.send({
    from: "LOOPS <onboarding@resend.dev>",
    to: email,
    subject: "Sign in to LOOPS",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 32px; font-weight: 900; letter-spacing: -1px; color: #c8ff00; margin: 0;">LOOPS</h1>
          <p style="color: #888; font-size: 14px; margin-top: 4px;">Gravel Routes Ireland</p>
        </div>
        <div style="background: #111; border: 1px solid #222; border-radius: 16px; padding: 32px; text-align: center;">
          <p style="color: #ccc; font-size: 16px; margin: 0 0 24px;">Click the button below to sign in to your account. This link expires in 15 minutes.</p>
          <a href="${link}" style="display: inline-block; background: #c8ff00; color: #000; font-weight: 700; font-size: 14px; text-decoration: none; padding: 12px 32px; border-radius: 12px; letter-spacing: 0.5px; text-transform: uppercase;">
            Sign in to LOOPS
          </a>
          <p style="color: #666; font-size: 12px; margin-top: 24px;">If you didn't request this, you can safely ignore this email.</p>
        </div>
      </div>
    `,
  });
}
