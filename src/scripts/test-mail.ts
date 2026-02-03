import { EmailVerification } from "../classes/EmailVerificationClass";

await EmailVerification.sendVerifyEmail(
  "arthit@kitsomboon.com",
  "test-token-123"
);

console.log("Mail sent");