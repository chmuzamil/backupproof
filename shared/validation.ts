import { ZodError } from "zod";

const fieldLabels: Record<string, string> = {
  currentPassword: "Current password",
  newPassword: "New password",
  confirmPassword: "Confirm password",
  password: "Password",
  username: "Username"
};

function labelFor(path: (string | number)[]): string {
  const key = String(path[0] ?? "");
  return fieldLabels[key] ?? key;
}

export function formatZodError(error: ZodError): string {
  return error.issues
    .map((issue) => {
      if (issue.code === "too_small" && issue.type === "string") {
        const label = labelFor(issue.path);
        return `${label} must be at least ${issue.minimum} characters.`;
      }
      if (issue.message) return issue.message;
      const label = labelFor(issue.path);
      return `${label} is invalid.`;
    })
    .join(" ");
}
