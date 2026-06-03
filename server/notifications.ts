import nodemailer from "nodemailer";
import { decryptSecret } from "./crypto";
import type { Alert, NotificationTarget } from "../shared/types";

export async function sendAlert(target: NotificationTarget, secret: string | undefined, alert: Alert) {
  if (!target.enabled || !secret) return false;
  const cfg = decryptSecret<Record<string, string>>(secret);
  const payload = { severity: alert.severity, title: alert.title, message: alert.message };

  if (target.type === "webhook") {
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return response.ok;
  }

  if (target.type === "slack") {
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text: `[${alert.severity}] ${alert.title}: ${alert.message}` })
    });
    return response.ok;
  }

  if (target.type === "discord") {
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content: `[${alert.severity}] **${alert.title}**\n${alert.message}` })
    });
    return response.ok;
  }

  if (target.type === "telegram") {
    const response = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text: `[${alert.severity}] ${alert.title}: ${alert.message}` })
    });
    return response.ok;
  }

  if (target.type === "pagerduty") {
    const response = await fetch("https://events.pagerduty.com/v2/enqueue", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        routing_key: cfg.routingKey,
        event_action: alert.severity === "critical" ? "trigger" : "acknowledge",
        payload: {
          summary: alert.title,
          severity: alert.severity === "critical" ? "critical" : "warning",
          source: "friendly-restore-dashboard",
          custom_details: { message: alert.message }
        }
      })
    });
    return response.ok;
  }

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port ?? 587),
    secure: cfg.secure === "true",
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined
  });
  await transporter.sendMail({
    from: cfg.from,
    to: cfg.to,
    subject: `[${alert.severity}] ${alert.title}`,
    text: alert.message
  });
  return true;
}
