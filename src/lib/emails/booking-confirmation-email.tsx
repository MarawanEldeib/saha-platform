import { format, parse } from "date-fns";
import { FROM_ADDRESS } from "@/lib/email-config";

interface BookingConfirmationEmailProps {
  bookingId: string;
  playerName: string;
  playerEmail: string;
  facilityName: string;
  facilityAddress: string;
  facilityCity: string;
  courtName: string;
  date: string;
  startTime: string;
  endTime: string;
  numPlayers: number;
  totalPrice: number;
  currency: string;
  appUrl: string;
}

export async function generateBookingConfirmationEmail(
  props: BookingConfirmationEmailProps
): Promise<string> {
  const {
    bookingId,
    playerName,
    playerEmail,
    facilityName,
    facilityAddress,
    facilityCity,
    courtName,
    date,
    startTime,
    endTime,
    numPlayers,
    totalPrice,
    currency,
    appUrl,
  } = props;

  // Parse date and times
  const bookingDate = new Date(date);
  const formattedDate = format(bookingDate, "EEEE, MMMM d, yyyy");
  
  // Parse times (assuming HH:mm format)
  const [startHour, startMin] = startTime.split(":");
  const [endHour, endMin] = endTime.split(":");
  
  const startDateTime = new Date(bookingDate);
  startDateTime.setHours(parseInt(startHour), parseInt(startMin));
  
  const endDateTime = new Date(bookingDate);
  endDateTime.setHours(parseInt(endHour), parseInt(endMin));

  // Generate QR code as base64 using dynamic import
  const QRCode = await import("qrcode");
  const qrCodeDataUrl = await QRCode.toDataURL(
    `${appUrl}/en/bookings/${bookingId}`,
    {
      errorCorrectionLevel: "H",
      type: "image/png",
      width: 300,
      margin: 1,
      color: {
        dark: "#000000",
        light: "#FFFFFF",
      },
    }
  );

  // Generate Google Calendar link
  const googleCalendarUrl = generateGoogleCalendarLink({
    title: `Court Booking - ${courtName}`,
    startTime: startDateTime,
    endTime: endDateTime,
    location: `${facilityName}, ${facilityAddress}`,
    description: `Your booking at ${facilityName}\nCourt: ${courtName}\nPlayers: ${numPlayers}`,
  });

  // Generate WhatsApp share link
  const whatsappMessage = encodeURIComponent(
    `✅ Booking Confirmed!\n\n` +
      `🏟 ${courtName} at ${facilityName}\n` +
      `📅 ${formattedDate}\n` +
      `⏰ ${startTime} – ${endTime}\n` +
      `👥 ${numPlayers} player${numPlayers > 1 ? "s" : ""}\n` +
      `💰 ${currency} ${totalPrice}\n\n` +
      `📍 ${facilityAddress}, ${facilityCity}\n\n` +
      `View booking:\n${appUrl}/en/bookings/${bookingId}`
  );
  const whatsappLink = `https://wa.me/?text=${whatsappMessage}`;

  // Generate Google Maps link
  const mapsLink = `https://www.google.com/maps/search/${encodeURIComponent(
    `${facilityAddress}, ${facilityCity}`
  )}`;

  // Construct HTML email
  const html = `
    <!DOCTYPE html>
    <html lang="en">
    <head>
      <meta charset="UTF-8">
      <meta name="viewport" content="width=device-width, initial-scale=1.0">
      <title>Booking Confirmation</title>
      <style>
        body {
          font-family: -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif;
          line-height: 1.6;
          color: #333;
          background-color: #f9fafb;
          margin: 0;
          padding: 0;
        }
        .container {
          max-width: 600px;
          margin: 20px auto;
          background: white;
          border-radius: 8px;
          box-shadow: 0 2px 4px rgba(0,0,0,0.1);
          overflow: hidden;
        }
        .header {
          background: linear-gradient(135deg, #667eea 0%, #764ba2 100%);
          color: white;
          padding: 30px 20px;
          text-align: center;
        }
        .header h1 {
          margin: 0;
          font-size: 28px;
          font-weight: 700;
        }
        .content {
          padding: 30px 20px;
        }
        .greeting {
          font-size: 16px;
          margin-bottom: 20px;
        }
        .qr-section {
          text-align: center;
          margin: 30px 0;
          padding: 20px;
          background-color: #f3f4f6;
          border-radius: 8px;
        }
        .qr-section img {
          max-width: 200px;
          height: auto;
        }
        .qr-label {
          font-size: 12px;
          color: #666;
          margin-top: 10px;
        }
        .details-section {
          background-color: #f9fafb;
          border-left: 4px solid #667eea;
          padding: 20px;
          margin: 20px 0;
          border-radius: 4px;
        }
        .detail-row {
          display: flex;
          justify-content: space-between;
          margin-bottom: 12px;
          font-size: 14px;
        }
        .detail-label {
          font-weight: 600;
          color: #666;
        }
        .detail-value {
          color: #333;
        }
        .action-buttons {
          display: flex;
          gap: 10px;
          margin: 25px 0;
          flex-wrap: wrap;
        }
        .button {
          flex: 1;
          min-width: 140px;
          padding: 12px 16px;
          text-align: center;
          text-decoration: none;
          border-radius: 6px;
          font-size: 14px;
          font-weight: 600;
          transition: all 0.2s;
          display: inline-block;
        }
        .button-primary {
          background-color: #667eea;
          color: white;
        }
        .button-primary:hover {
          background-color: #5568d3;
        }
        .button-secondary {
          background-color: #e5e7eb;
          color: #333;
        }
        .button-secondary:hover {
          background-color: #d1d5db;
        }
        .button-whatsapp {
          background-color: #25d366;
          color: white;
        }
        .button-whatsapp:hover {
          background-color: #1ebd59;
        }
        .button-maps {
          background-color: #f84c3d;
          color: white;
        }
        .button-maps:hover {
          background-color: #de3d2c;
        }
        .footer {
          background-color: #f3f4f6;
          padding: 20px;
          text-align: center;
          font-size: 12px;
          color: #999;
          border-top: 1px solid #e5e7eb;
        }
        .facility-info {
          background-color: #eff6ff;
          border: 1px solid #bfdbfe;
          padding: 15px;
          border-radius: 6px;
          margin: 20px 0;
          font-size: 14px;
        }
        .facility-info strong {
          display: block;
          margin-bottom: 5px;
          color: #1e40af;
        }
        @media (max-width: 600px) {
          .container {
            margin: 0;
            border-radius: 0;
          }
          .content {
            padding: 20px 15px;
          }
          .action-buttons {
            flex-direction: column;
          }
          .button {
            min-width: 100%;
          }
          .detail-row {
            flex-direction: column;
          }
        }
      </style>
    </head>
    <body>
      <div class="container">
        <div class="header">
          <h1>✅ Booking Confirmed!</h1>
        </div>
        
        <div class="content">
          <div class="greeting">
            <p>Hi ${playerName},</p>
            <p>Your court booking has been confirmed! Here are your booking details:</p>
          </div>

          <div class="details-section">
            <div class="detail-row">
              <span class="detail-label">🏟 Facility:</span>
              <span class="detail-value">${facilityName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">🏸 Court:</span>
              <span class="detail-value">${courtName}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">📅 Date:</span>
              <span class="detail-value">${formattedDate}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">⏰ Time:</span>
              <span class="detail-value">${startTime} – ${endTime}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">👥 Players:</span>
              <span class="detail-value">${numPlayers}</span>
            </div>
            <div class="detail-row">
              <span class="detail-label">💰 Total:</span>
              <span class="detail-value">${currency} ${totalPrice.toFixed(2)}</span>
            </div>
          </div>

          <div class="qr-section">
            <p style="margin-top: 0; margin-bottom: 15px; font-size: 14px; color: #333;"><strong>Your Booking QR Code</strong></p>
            <img src="${qrCodeDataUrl}" alt="Booking QR Code" />
            <div class="qr-label">Scan to view your booking details</div>
          </div>

          <div class="facility-info">
            <strong>📍 Facility Location</strong>
            ${facilityAddress}<br/>
            ${facilityCity}
          </div>

          <div class="action-buttons">
            <a href="${appUrl}/en/bookings/${bookingId}" class="button button-primary">View Booking</a>
            <a href="${googleCalendarUrl}" class="button button-secondary">Add to Calendar</a>
            <a href="${whatsappLink}" class="button button-whatsapp">Share on WhatsApp</a>
            <a href="${mapsLink}" class="button button-maps">View on Maps</a>
          </div>

          <p style="font-size: 14px; margin-top: 25px; color: #666;">
            <strong>💡 Tip:</strong> Download our mobile app for quick check-in at the facility using your QR code.
          </p>

          <p style="font-size: 14px; margin-top: 20px; color: #999;">
            If you need to reschedule or cancel, visit your bookings page. Most cancellations are free if made before 24 hours.
          </p>
        </div>

        <div class="footer">
          <p style="margin: 0;">© 2026 Saha. All rights reserved.</p>
          <p style="margin: 5px 0 0 0;">Questions? Contact support@saha.ae</p>
        </div>
      </div>
    </body>
    </html>
  `;

  return html;
}

interface CalendarLinkParams {
  title: string;
  startTime: Date;
  endTime: Date;
  location: string;
  description: string;
}

function generateGoogleCalendarLink(params: CalendarLinkParams): string {
  const startISO = params.startTime.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";
  const endISO = params.endTime.toISOString().replace(/[-:]/g, "").split(".")[0] + "Z";

  const url = new URL("https://calendar.google.com/calendar/render");
  url.searchParams.set("action", "TEMPLATE");
  url.searchParams.set("text", params.title);
  url.searchParams.set("dates", `${startISO}/${endISO}`);
  url.searchParams.set("details", params.description);
  url.searchParams.set("location", params.location);

  return url.toString();
}

export async function sendBookingConfirmationEmail(
  props: BookingConfirmationEmailProps & {
    resendApiKey?: string;
    /** SAH-90: optional Tax-Invoice PDF, attached as `invoice-<short>.pdf`. */
    invoicePdf?: { buffer: Buffer; invoiceNumber: string } | null;
  }
): Promise<{ success: boolean; error?: string }> {
  try {
    const { resendApiKey, invoicePdf, ...emailProps } = props;
    const html = await generateBookingConfirmationEmail(emailProps);

    // Import Resend dynamically to avoid issues if not configured
    const { Resend } = await import("resend");
    const resend = new Resend(resendApiKey || process.env.RESEND_API_KEY);

    const attachments = invoicePdf
      ? [{
          filename: `${invoicePdf.invoiceNumber}.pdf`,
          content: invoicePdf.buffer,
        }]
      : undefined;

    const result = await resend.emails.send({
      from: FROM_ADDRESS,
      to: props.playerEmail,
      subject: `Booking Confirmed - ${props.courtName} on ${props.date}`,
      html,
      attachments,
    });

    if (result.error) {
      const { captureRouteError } = await import("@/lib/sentry-helpers");
      captureRouteError(result.error, {
        route: "emails:booking-confirmation",
        level: "error",
        extra: { booking_id: props.bookingId, recipient: props.playerEmail },
      });
      return { success: false, error: result.error.message };
    }

    return { success: true };
  } catch (error) {
    const { captureRouteError } = await import("@/lib/sentry-helpers");
    captureRouteError(error, {
      route: "emails:booking-confirmation",
      level: "error",
      extra: { booking_id: props.bookingId, recipient: props.playerEmail },
    });
    return {
      success: false,
      error: error instanceof Error ? error.message : "Unknown error",
    };
  }
}
