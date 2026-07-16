import nodemailer from 'nodemailer';

const SMTP_EMAIL = process.env.SMTP_EMAIL;
const SMTP_APP_PASSWORD = process.env.SMTP_APP_PASSWORD;
const SITE_URL = process.env.SITE_URL || 'http://localhost:5173';

let transporter = null;

if (SMTP_EMAIL && SMTP_APP_PASSWORD) {
  transporter = nodemailer.createTransport({
    service: 'gmail',
    auth: {
      user: SMTP_EMAIL,
      pass: SMTP_APP_PASSWORD,
    },
  });
  console.log(`Email service configured with ${SMTP_EMAIL}`);
} else {
  console.warn('SMTP_EMAIL and SMTP_APP_PASSWORD not set in .env — email sending is disabled.');
}

/**
 * Send a welcome email to a newly registered intern with their credentials
 * and a link to change their password.
 */
export async function sendWelcomeEmail({ email, fullName, username, password, resetToken }) {
  if (!transporter) {
    console.warn(`Email not configured. Skipping welcome email to: ${email}`);
    return { sent: false, reason: 'Email not configured' };
  }

  const resetLink = `${SITE_URL}/set-password?token=${resetToken}`;

  const html = `
<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
</head>
<body style="margin:0; padding:0; background-color:#f0f4f8; font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f0f4f8; padding:40px 20px;">
    <tr>
      <td align="center">
        <table width="600" cellpadding="0" cellspacing="0" style="background-color:#ffffff; border-radius:16px; overflow:hidden; box-shadow: 0 4px 24px rgba(0,18,64,0.10);">
          
          <!-- Header -->
          <tr>
            <td style="background: linear-gradient(135deg, #001240 0%, #003087 100%); padding:32px 40px; text-align:center;">
              <h1 style="color:#ffffff; margin:0; font-size:22px; font-weight:700; letter-spacing:0.5px;">
                🛡️ PNP-ITMS Internship Portal
              </h1>
              <p style="color:#93c5fd; margin:8px 0 0; font-size:13px;">Information Technology Management Service</p>
            </td>
          </tr>

          <!-- Body -->
          <tr>
            <td style="padding:36px 40px;">
              <h2 style="color:#001240; margin:0 0 8px; font-size:20px;">Welcome, ${fullName}!</h2>
              <p style="color:#475569; font-size:14px; line-height:1.7; margin:0 0 24px;">
                Your intern account has been created by the PNP-ITMS administrator. Below are your login credentials to access the Internship Attendance Portal.
              </p>

              <!-- Credentials Box -->
              <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f8fafc; border:1px solid #e2e8f0; border-radius:12px; margin-bottom:24px;">
                <tr>
                  <td style="padding:20px 24px;">
                    <table width="100%" cellpadding="0" cellspacing="0">
                      <tr>
                        <td style="padding:6px 0;">
                          <span style="color:#64748b; font-size:12px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Username</span><br>
                          <span style="color:#001240; font-size:16px; font-weight:700; font-family:monospace;">${username}</span>
                        </td>
                      </tr>
                      <tr>
                        <td style="padding:12px 0 6px; border-top:1px solid #e2e8f0;">
                          <span style="color:#64748b; font-size:12px; text-transform:uppercase; letter-spacing:1px; font-weight:600;">Initial Password</span><br>
                          <span style="color:#001240; font-size:16px; font-weight:700; font-family:monospace;">${password}</span>
                        </td>
                      </tr>
                    </table>
                  </td>
                </tr>
              </table>

              <!-- Security Notice -->
              <div style="background-color:#fef3c7; border:1px solid #fbbf24; border-radius:10px; padding:14px 18px; margin-bottom:24px;">
                <p style="color:#92400e; font-size:13px; margin:0; line-height:1.6;">
                  ⚠️ <strong>For your security</strong>, we strongly recommend changing your password immediately using the button below. This ensures only you can access your account.
                </p>
              </div>

              <!-- CTA Button -->
              <table width="100%" cellpadding="0" cellspacing="0">
                <tr>
                  <td align="center" style="padding:8px 0 24px;">
                    <a href="${resetLink}" style="display:inline-block; background: linear-gradient(135deg, #2563eb 0%, #1d4ed8 100%); color:#ffffff; text-decoration:none; padding:14px 40px; border-radius:10px; font-size:15px; font-weight:600; letter-spacing:0.3px; box-shadow: 0 4px 12px rgba(37,99,235,0.3);">
                      🔐 Set Your Own Password
                    </a>
                  </td>
                </tr>
              </table>

              <p style="color:#94a3b8; font-size:12px; text-align:center; margin:0 0 8px;">
                This link will expire in <strong>48 hours</strong>. If it expires, contact your administrator.
              </p>
            </td>
          </tr>

          <!-- Footer -->
          <tr>
            <td style="background-color:#f8fafc; padding:20px 40px; border-top:1px solid #e2e8f0; text-align:center;">
              <p style="color:#94a3b8; font-size:11px; margin:0; line-height:1.6;">
                This is an automated message from PNP-ITMS Internship Portal.<br>
                Please do not reply to this email.
              </p>
            </td>
          </tr>

        </table>
      </td>
    </tr>
  </table>
</body>
</html>`;

  try {
    await transporter.sendMail({
      from: `"PNP-ITMS Portal" <${SMTP_EMAIL}>`,
      to: email,
      subject: '🛡️ Welcome to PNP-ITMS — Your Account is Ready',
      html,
    });
    console.log(`Welcome email sent to ${email}`);
    return { sent: true };
  } catch (err) {
    console.error(`Failed to send welcome email to ${email}:`, err.message);
    return { sent: false, reason: err.message };
  }
}
