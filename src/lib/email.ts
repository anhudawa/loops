import { Resend } from "resend";

function getResend() {
  return new Resend(process.env.RESEND_API_KEY);
}

export async function sendMagicLink(email: string, token: string) {
  const resend = getResend();
  // The public domain in production (VERCEL_URL is the per-deployment host,
  // which would put a *.vercel.app link in the rider's inbox).
  const baseUrl = process.env.NEXT_PUBLIC_BASE_URL
    || (process.env.VERCEL_ENV === "production" ? "https://www.loops.ie"
      : process.env.VERCEL_URL ? `https://${process.env.VERCEL_URL}` : "http://localhost:3000");

  const link = `${baseUrl}/api/auth/verify?token=${token}`;

  await resend.emails.send({
    from: "LOOPS <hello@loops.ie>",
    to: email,
    subject: "Sign in to LOOPS",
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 32px;">
          <h1 style="font-size: 32px; font-weight: 900; letter-spacing: -1px; color: #c8ff00; margin: 0;">LOOPS</h1>
          <p style="color: #888; font-size: 14px; margin-top: 4px;">Cycling Routes Worldwide</p>
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

/**
 * "Did you ride it?" — the day after a rider saved a route. One tap on a
 * star opens the check-in page with that score chosen (the page asks the
 * rider to confirm, so a mail scanner's link preview never records a rating).
 */
export async function sendRideCheckEmail(email: string, routeName: string, checkUrl: string) {
  const resend = getResend();
  const safe = routeName.replace(/[<>&"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", '"': "&quot;" })[c]!);
  const star = (n: number) =>
    `<a href="${checkUrl}?rode=1&score=${n}" style="display:inline-block;width:44px;height:44px;line-height:44px;margin:0 3px;border-radius:12px;background:#1a1a1a;border:1px solid #333;color:#c8ff00;font-size:22px;text-decoration:none;">&#9733;</a>`;
  await resend.emails.send({
    from: "LOOPS <hello@loops.ie>",
    to: email,
    subject: `Did you ride ${routeName}?`,
    html: `
      <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', sans-serif; max-width: 480px; margin: 0 auto; padding: 40px 20px;">
        <div style="text-align: center; margin-bottom: 24px;">
          <h1 style="font-size: 32px; font-weight: 900; letter-spacing: -1px; color: #c8ff00; margin: 0;">LOOPS</h1>
        </div>
        <div style="background: #111; border: 1px solid #222; border-radius: 16px; padding: 28px; text-align: center;">
          <p style="color: #eee; font-size: 17px; font-weight: 700; margin: 0 0 6px;">Did you ride ${safe}?</p>
          <p style="color: #999; font-size: 14px; margin: 0 0 20px;">If you did, how was it? Your stars decide whether we suggest it to other riders.</p>
          <div style="margin-bottom: 18px;">${[1, 2, 3, 4, 5].map(star).join("")}</div>
          <p style="margin: 0;"><a href="${checkUrl}?rode=0" style="color: #aaa; font-size: 13px;">I didn't ride it</a> &nbsp;·&nbsp; <a href="${checkUrl}" style="color: #aaa; font-size: 13px;">Not yet</a></p>
        </div>
      </div>
    `,
  });
}
