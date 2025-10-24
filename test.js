import { sendSMTPMail } from "./sendEmail.js";

sendSMTPMail({
  to: "gaganjotbase2brand@gmail.com", // 👈 apna email likh
  name: "Tester",
  temporaryPassword: "Abc@123",
});
