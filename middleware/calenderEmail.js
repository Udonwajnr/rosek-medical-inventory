const nodemailer = require('nodemailer');
const purchase = require('../model/purchase');

// Function to send the email with ICS file attached
const sendEmailWithICS = async (userDoc, icsFilePath, newMedication,hospitalDoc,populatedPurchase) => {
    const transporter = nodemailer.createTransport({
        service: 'Gmail',
        auth: {
            user: process.env.EMAIL_USER,
            pass: process.env.EMAIL_PASSCODE,
        },
    });
    // Email content
    const mailOptions = {
        from: 'umohu67@gmail.com',
        to: userDoc.email,
        subject: 'Your Medication Purchase and Reminder',
        html: `
            <!DOCTYPE html>
<html lang="en">
<head>
    <meta charset="UTF-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>Your Medication Purchase and Reminder</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Arial', sans-serif; background-color: #f4f7f6; color: #333;">
    <table role="presentation" style="width: 100%; border-collapse: collapse;">
        <tr>
            <td align="center" style="padding: 40px 0;">
                <table role="presentation" style="width: 600px; border-collapse: collapse; background-color: #ffffff; border-radius: 8px; box-shadow: 0 4px 6px rgba(0, 0, 0, 0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="padding: 40px 30px; text-align: center; background-color: #4CAF50; border-radius: 8px 8px 0 0;">
                            <h1 style="color: #ffffff; font-size: 28px; margin: 0;">Thank You for Your Purchase!</h1>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px 30px;">
                            <p style="font-size: 16px; line-height: 1.5; margin-bottom: 20px;">You have purchased medications from <strong style="color: #4CAF50;">${hospitalDoc.name}</strong>. Please find the list of purchased medications and your medication reminder below.</p>
                            
                            <h3 style="color: #4CAF50; margin-top: 30px; margin-bottom: 15px;">Purchased Medications:</h3>
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin-bottom: 20px;">
                                <tr style="background-color: #f0f7f0;">
                                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Medication</th>
                                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Quantity</th>
                                    <th style="padding: 10px; text-align: left; border-bottom: 1px solid #ddd;">Instructions</th>
                                </tr>
                                ${populatedPurchase.medications.map(med => `
                                    <tr>
                                        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${med?.medication.nameOfDrugs}</td>
                                        <td style="padding: 10px; border-bottom: 1px solid #ddd;">${med.quantity}</td>
                                    </tr>
                                `).join('')}
                            </table>

                            <!-- Attachment Info Box -->
                            <table role="presentation" style="width: 100%; border-collapse: collapse; margin-top: 30px; margin-bottom: 30px;">
                                <tr>
                                    <td style="background-color: #f0f7f0; border-radius: 8px; padding: 20px;">
                                        <h3 style="color: #4CAF50; margin-top: 0;">Having trouble with the attachment?</h3>
                                        <p style="font-size: 14px; line-height: 1.5; margin-bottom: 15px;">If you can't download the .ics file, try using Google Calendar:</p>
                                        <a href="https://play.google.com/store/apps/details?id=com.google.android.calendar" target="_blank" style="display: inline-block; background-color: #4CAF50; color: #ffffff; text-decoration: none; padding: 10px 20px; border-radius: 5px; font-weight: bold;">Download Google Calendar</a>
                                    </td>
                                </tr>
                            </table>

                            <p style="font-size: 16px; line-height: 1.5; margin-bottom: 10px;">Warm regards,</p>
                            <p style="font-size: 18px; font-weight: bold; color: #4CAF50; margin-top: 0;">RosekHealth</p>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="padding: 20px 30px; text-align: center; background-color: #f4f7f6; border-radius: 0 0 8px 8px;">
                            <p style="font-size: 14px; color: #666;">© 2023 RosekHealth. All rights reserved.</p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
        </table>
    </body>
    </html>
        `,
        attachments: [
            {
                filename: 'medication-reminders.ics',
                path: icsFilePath, // Path to the generated ICS file
            },
        ],
    };
    

    try {
        await transporter.sendMail(mailOptions);
        console.log('Email sent successfully');
    } catch (error) {
        console.error('Error sending email:', error);
        throw error;
    }
};

// Export the function
module.exports = sendEmailWithICS;
