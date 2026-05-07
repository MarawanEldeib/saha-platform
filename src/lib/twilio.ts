import twilio from "twilio";

const client = twilio(
    process.env.TWILIO_ACCOUNT_SID,
    process.env.TWILIO_AUTH_TOKEN
);

const FROM = process.env.TWILIO_WHATSAPP_FROM ?? "whatsapp:+14155238886";

export async function sendWhatsApp(to: string, body: string): Promise<void> {
    const phone = to.startsWith("whatsapp:") ? to : `whatsapp:${to}`;
    await client.messages.create({ from: FROM, to: phone, body });
}
