import nodemailer from "nodemailer";
import { createTestNotificationAlert, formatNotificationText } from "../shared/notificationCopy";
import { decryptSecret, encryptSecret } from "./crypto";
import type { Alert, NotificationTarget } from "../shared/types";

export async function sendAlert(target: NotificationTarget, secret: string | undefined, alert: Alert) {
  if (!target.enabled || !secret) return false;
  const cfg = decryptSecret<Record<string, string>>(secret);
  const formatted = formatNotificationText(target.type, alert);
  const payload = typeof formatted === "string"
    ? { severity: alert.severity, title: alert.title, message: formatted }
    : "severity" in formatted
      ? formatted
      : { severity: alert.severity, title: alert.title, message: alert.message };

  if (target.type === "webhook") {
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(payload)
    });
    return response.ok;
  }

  if (target.type === "slack") {
    const text = typeof formatted === "string" ? formatted : `${payload.title}: ${payload.message}`;
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ text })
    });
    return response.ok;
  }

  if (target.type === "discord") {
    const content = typeof formatted === "string" ? formatted : `**${payload.title}**\n${payload.message}`;
    const response = await fetch(cfg.url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ content })
    });
    return response.ok;
  }

  if (target.type === "telegram") {
    const text = typeof formatted === "string" ? formatted : `${payload.title}: ${payload.message}`;
    const response = await fetch(`https://api.telegram.org/bot${cfg.token}/sendMessage`, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ chat_id: cfg.chatId, text })
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
          summary: payload.title,
          severity: alert.severity === "critical" ? "critical" : "warning",
          source: "backupproof",
          custom_details: { message: payload.message }
        }
      })
    });
    return response.ok;
  }

  const email = typeof formatted === "object" && "subject" in formatted
    ? formatted
    : { subject: `[${alert.severity}] ${alert.title}`, text: alert.message };

  const transporter = nodemailer.createTransport({
    host: cfg.host,
    port: Number(cfg.port ?? 587),
    secure: cfg.secure === "true",
    auth: cfg.user ? { user: cfg.user, pass: cfg.pass } : undefined
  });
  await transporter.sendMail({
    from: cfg.from,
    to: cfg.to,
    subject: email.subject,
    text: email.text
  });
  return true;
}

export async function sendTestNotification(target: NotificationTarget, secret: string | undefined) {
  return sendAlert(target, secret, {
    ...createTestNotificationAlert(),
    id: "test",
    appId: "system",
    createdAt: new Date().toISOString()
  });
}

export async function sendTestNotificationConfig(type: NotificationTarget["type"], config: Record<string, string>) {
  const target: NotificationTarget = {
    id: "test",
    name: "Test alert",
    type,
    enabled: true,
    configSecretId: "inline",
    createdAt: new Date().toISOString(),
    updatedAt: new Date().toISOString()
  };
  return sendAlert(target, encryptSecret(config), {
    ...createTestNotificationAlert(),
    id: "test",
    appId: "system",
    createdAt: new Date().toISOString()
  });
}
