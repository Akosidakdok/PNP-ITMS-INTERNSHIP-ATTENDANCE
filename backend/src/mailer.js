import nodemailer from 'nodemailer';

const transporter = nodemailer.createTransport({
  service: 'gmail',
  auth: {
    user: process.env.SMTP_EMAIL,
    pass: process.env.SMTP_APP_PASSWORD,
  },
});

export const sendWelcomeEmail = async (toEmail, name, username, password) => {
  const loginUrl = process.env.SITE_URL || 'http://localhost:5173';

  const mailOptions = {
    from: `"PNP ITMS Attendance System" <${process.env.SMTP_EMAIL}>`,
    to: toEmail,
    subject: 'Welcome to the PNP ITMS Internship Program',
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; padding: 20px; border: 1px solid #e0e0e0; border-radius: 8px;">
        <h2 style="color: #1a365d; text-align: center;">PNP ITMS Internship Program</h2>
        <p>Dear ${name},</p>
        <p>Welcome! Your internship account has been successfully created.</p>
        
        <div style="background-color: #f8fafc; padding: 15px; border-radius: 6px; margin: 20px 0;">
          <h3 style="margin-top: 0; color: #334155;">Your Account Credentials:</h3>
          <p style="margin: 5px 0;"><strong>Username:</strong> ${username}</p>
          <p style="margin: 5px 0;"><strong>Temporary Password:</strong> ${password}</p>
        </div>

        <p style="color: #dc2626; font-size: 14px;"><strong>Important:</strong> Please log in and change your temporary password immediately for security purposes.</p>

        <div style="text-align: center; margin: 30px 0;">
          <a href="${loginUrl}" style="background-color: #1d4ed8; color: white; padding: 12px 24px; text-decoration: none; border-radius: 6px; font-weight: bold;">Login to Your Account</a>
        </div>

        <hr style="border: 0; border-top: 1px solid #e0e0e0; margin: 20px 0;" />
        <p style="font-size: 12px; color: #64748b; text-align: center;">
          This is an automated message. Please do not reply to this email.
        </p>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log(`Welcome email sent to ${toEmail}`);
  } catch (error) {
    console.error('Error sending welcome email:', error);
    // Don't throw the error so that account creation still succeeds even if email fails
  }
};
